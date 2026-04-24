<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePaymentRequest;
use App\Http\Requests\UpdatePaymentRequest;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PaymentController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {
    }

    private const DEFAULT_PER_PAGE = 15;
    private const MAX_PER_PAGE = 100;

    /**
     * @var list<string>
     */
    private const ALLOWED_SORT_FIELDS = [
        'payment_date',
        'amount',
        'created_at',
    ];

    public function index(Request $request): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);
        $perPage = $this->resolvePerPage($request);
        $summaryQuery = Payment::query()->where('dentist_id', $dentistId);

        $query = Payment::query()->where('dentist_id', $dentistId);

        $patientId = $request->input('filter.patient_id');
        if (is_string($patientId) && $patientId !== '') {
            $query->where('patient_id', $patientId);
            $summaryQuery->where('patient_id', $patientId);
        }

        $invoiceId = $request->input('filter.invoice_id');
        if (is_string($invoiceId) && $invoiceId !== '') {
            $query->where('invoice_id', $invoiceId);
            $summaryQuery->where('invoice_id', $invoiceId);
        }

        $dateFrom = $request->input('filter.date_from');
        if (is_string($dateFrom) && $dateFrom !== '') {
            $query->whereDate('payment_date', '>=', $dateFrom);
            $summaryQuery->whereDate('payment_date', '>=', $dateFrom);
        }

        $dateTo = $request->input('filter.date_to');
        if (is_string($dateTo) && $dateTo !== '') {
            $query->whereDate('payment_date', '<=', $dateTo);
            $summaryQuery->whereDate('payment_date', '<=', $dateTo);
        }

        $this->applySort($query, $request->query('sort', '-payment_date'));

        $payments = $query->paginate($perPage);
        $summary = $summaryQuery
            ->selectRaw('COUNT(*) AS total_count, COALESCE(SUM(amount), 0) AS total_amount')
            ->first();
        $totalCount = (int) ($summary?->getAttribute('total_count') ?? 0);
        $totalAmount = (float) ($summary?->getAttribute('total_amount') ?? 0);

        return response()->json([
            'data' => $payments
                ->getCollection()
                ->map(fn (Payment $payment): array => $this->transformPayment($payment))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $payments->currentPage(),
                    'per_page' => $payments->perPage(),
                    'total' => $payments->total(),
                    'total_pages' => $payments->lastPage(),
                ],
                'summary' => [
                    'total_count' => $totalCount,
                    'total_amount' => $totalAmount,
                ],
            ],
        ]);
    }

    public function store(StorePaymentRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $dentistId = $this->resolveDentistId($request);

        $payment = DB::transaction(function () use ($validated, $dentistId): Payment {
            /** @var Invoice $invoice */
            $invoice = Invoice::query()
                ->where('id', $validated['invoice_id'])
                ->where('dentist_id', $dentistId)
                ->lockForUpdate()
                ->firstOrFail();

            $amount = $this->normalizeMoney($validated['amount']);
            $balance = $this->normalizeMoney($invoice->balance);

            if (bccomp($amount, $balance, 2) === 1) {
                throw ValidationException::withMessages([
                    'amount' => [__('api.payments.amount_exceeds_balance')],
                ]);
            }

            $newPaid = bcadd($this->normalizeMoney($invoice->paid_amount), $amount, 2);
            $newBalance = bcsub($this->normalizeMoney($invoice->total_amount), $newPaid, 2);
            $newStatus = $this->resolveInvoiceStatus($this->normalizeMoney($invoice->total_amount), $newPaid);

            $invoice->update([
                'paid_amount' => $newPaid,
                'balance' => $newBalance,
                'status' => $newStatus,
            ]);

            return Payment::create([
                'dentist_id' => $dentistId,
                'patient_id' => $invoice->patient_id,
                'invoice_id' => $invoice->id,
                'amount' => $amount,
                'payment_method' => $validated['payment_method'],
                'payment_date' => $validated['payment_date'],
                'notes' => null,
            ]);
        });

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'payment.created',
            entityType: 'payment',
            entityId: (string) $payment->id,
            metadata: [
                'invoice_id' => (string) $payment->invoice_id,
                'amount' => (float) $payment->amount,
            ],
        );

        return response()->json([
            'data' => $this->transformPayment($payment),
        ], 201);
    }

    public function update(UpdatePaymentRequest $request, string $id): JsonResponse
    {
        $validated = $request->validated();
        $dentistId = $this->resolveDentistId($request);

        $payment = DB::transaction(function () use ($validated, $dentistId, $id): Payment {
            /** @var Payment $payment */
            $payment = Payment::query()
                ->where('id', $id)
                ->where('dentist_id', $dentistId)
                ->lockForUpdate()
                ->firstOrFail();

            /** @var Invoice $invoice */
            $invoice = Invoice::query()
                ->where('id', $payment->invoice_id)
                ->where('dentist_id', $dentistId)
                ->lockForUpdate()
                ->firstOrFail();

            $currentPaid = $this->normalizeMoney($invoice->paid_amount);
            $existingPaymentAmount = $this->normalizeMoney($payment->amount);
            $newPaymentAmount = $this->normalizeMoney($validated['amount']);
            $totalAmount = $this->normalizeMoney($invoice->total_amount);

            // Temporarily remove this payment from totals, then apply updated amount.
            $basePaid = bcsub($currentPaid, $existingPaymentAmount, 2);
            if (bccomp($basePaid, '0.00', 2) === -1) {
                $basePaid = '0.00';
            }

            $maxAllowed = bcsub($totalAmount, $basePaid, 2);
            if (bccomp($newPaymentAmount, $maxAllowed, 2) === 1) {
                throw ValidationException::withMessages([
                    'amount' => [__('api.payments.amount_exceeds_balance')],
                ]);
            }

            $newPaid = bcadd($basePaid, $newPaymentAmount, 2);
            $newBalance = bcsub($totalAmount, $newPaid, 2);
            $newStatus = $this->resolveInvoiceStatus($totalAmount, $newPaid);

            $invoice->update([
                'paid_amount' => $newPaid,
                'balance' => $newBalance,
                'status' => $newStatus,
            ]);

            $payment->update([
                'amount' => $newPaymentAmount,
                'payment_method' => $validated['payment_method'],
                'payment_date' => $validated['payment_date'],
                'notes' => null,
            ]);

            return $payment->fresh();
        });

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'payment.updated',
            entityType: 'payment',
            entityId: (string) $payment->id,
            metadata: [
                'invoice_id' => (string) $payment->invoice_id,
                'amount' => (float) $payment->amount,
            ],
        );

        return response()->json([
            'data' => $this->transformPayment($payment),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);

        DB::transaction(function () use ($dentistId, $id): void {
            /** @var Payment $payment */
            $payment = Payment::query()
                ->where('id', $id)
                ->where('dentist_id', $dentistId)
                ->lockForUpdate()
                ->firstOrFail();

            /** @var Invoice $invoice */
            $invoice = Invoice::query()
                ->where('id', $payment->invoice_id)
                ->where('dentist_id', $dentistId)
                ->lockForUpdate()
                ->firstOrFail();

            $newPaid = bcsub(
                $this->normalizeMoney($invoice->paid_amount),
                $this->normalizeMoney($payment->amount),
                2
            );
            if (bccomp($newPaid, '0.00', 2) === -1) {
                $newPaid = '0.00';
            }

            $totalAmount = $this->normalizeMoney($invoice->total_amount);
            $newBalance = bcsub($totalAmount, $newPaid, 2);
            $newStatus = $this->resolveInvoiceStatus($totalAmount, $newPaid);

            $invoice->update([
                'paid_amount' => $newPaid,
                'balance' => $newBalance,
                'status' => $newStatus,
            ]);

            $payment->delete();
        });

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'payment.deleted',
            entityType: 'payment',
            entityId: $id,
            metadata: [],
        );

        return response()->json([], 204);
    }

    private function resolveInvoiceStatus(string $totalAmount, string $paidAmount): string
    {
        if (bccomp($paidAmount, '0.00', 2) <= 0) {
            return Invoice::STATUS_UNPAID;
        }

        if (bccomp($paidAmount, $totalAmount, 2) >= 0) {
            return Invoice::STATUS_PAID;
        }

        return Invoice::STATUS_PARTIALLY_PAID;
    }

    private function resolvePerPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        return min($perPage, self::MAX_PER_PAGE);
    }

    private function applySort(Builder $query, mixed $sort): void
    {
        if (! is_string($sort) || $sort === '') {
            $query->orderByDesc('payment_date');

            return;
        }

        $applied = false;
        foreach (explode(',', $sort) as $segment) {
            $segment = trim($segment);
            if ($segment === '') {
                continue;
            }

            $direction = str_starts_with($segment, '-') ? 'desc' : 'asc';
            $field = ltrim($segment, '-');

            if (! in_array($field, self::ALLOWED_SORT_FIELDS, true)) {
                continue;
            }

            $query->orderBy($field, $direction);
            $applied = true;
        }

        if (! $applied) {
            $query->orderByDesc('payment_date');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function transformPayment(Payment $payment): array
    {
        return [
            'id' => (string) $payment->id,
            'invoice_id' => (string) $payment->invoice_id,
            'patient_id' => (string) $payment->patient_id,
            'amount' => (float) $payment->amount,
            'payment_method' => $payment->payment_method,
            'payment_date' => $payment->payment_date?->toDateString(),
            'notes' => null,
            'created_at' => $payment->created_at?->toIso8601String(),
        ];
    }

    private function normalizeMoney(mixed $value): string
    {
        return number_format((float) $value, 2, '.', '');
    }

    private function resolveDentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }
}
