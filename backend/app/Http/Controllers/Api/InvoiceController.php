<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreInvoiceRequest;
use App\Http\Requests\UpdateInvoiceRequest;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\OdontogramEntry;
use App\Models\User;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InvoiceController extends Controller
{
    private const DEFAULT_PER_PAGE = 15;
    private const MAX_PER_PAGE = 100;

    /**
     * @var list<string>
     */
    private const ALLOWED_SORT_FIELDS = [
        'invoice_date',
        'created_at',
        'total_amount',
        'balance',
    ];

    /**
     * @var list<string>
     */
    private const OUTSTANDING_STATUSES = [
        Invoice::STATUS_UNPAID,
        Invoice::STATUS_PARTIALLY_PAID,
    ];

    public function index(Request $request): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);
        $perPage = $this->resolvePerPage($request);
        $summaryQuery = Invoice::query()->where('dentist_id', $dentistId);

        $query = Invoice::query()
            ->where('dentist_id', $dentistId)
            ->with('patient:id,full_name,phone');

        $patientId = $request->input('filter.patient_id');
        if (is_string($patientId) && $patientId !== '') {
            $query->where('patient_id', $patientId);
            $summaryQuery->where('patient_id', $patientId);
        }

        $status = $request->input('filter.status');
        if (is_string($status) && $status !== '') {
            $query->where('status', $status);
            $summaryQuery->where('status', $status);
        }

        $statuses = $this->resolveStatusFilters($request);
        if ($statuses !== []) {
            $query->whereIn('status', $statuses);
            $summaryQuery->whereIn('status', $statuses);
        }

        $search = $request->input('filter.search');
        if (is_string($search) && $search !== '') {
            $query->where(function (Builder $builder) use ($search): void {
                $builder
                    ->where('invoice_number', 'like', "%{$search}%")
                    ->orWhereHas('patient', function (Builder $patientQuery) use ($search): void {
                        $patientQuery
                            ->where('full_name', 'like', "%{$search}%")
                            ->orWhere('patient_id', 'like', "%{$search}%");
                    });
            });
            $summaryQuery->where(function (Builder $builder) use ($search): void {
                $builder
                    ->where('invoice_number', 'like', "%{$search}%")
                    ->orWhereHas('patient', function (Builder $patientQuery) use ($search): void {
                        $patientQuery
                            ->where('full_name', 'like', "%{$search}%")
                            ->orWhere('patient_id', 'like', "%{$search}%");
                    });
            });
        }

        $this->applySort($query, $request->query('sort', '-invoice_date'));

        $invoices = $query->paginate($perPage);
        $totalCount = (clone $summaryQuery)->count();
        $outstandingCount = (clone $summaryQuery)
            ->whereIn('status', self::OUTSTANDING_STATUSES)
            ->count();
        $outstandingTotal = (float) ((clone $summaryQuery)
            ->whereIn('status', self::OUTSTANDING_STATUSES)
            ->sum('balance'));
        $totalAmount = (float) ((clone $summaryQuery)->sum('total_amount'));

        return response()->json([
            'data' => $invoices
                ->getCollection()
                ->map(fn (Invoice $invoice): array => $this->transformInvoice($invoice))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $invoices->currentPage(),
                    'per_page' => $invoices->perPage(),
                    'total' => $invoices->total(),
                    'total_pages' => $invoices->lastPage(),
                ],
                'summary' => [
                    'total_count' => $totalCount,
                    'outstanding_count' => $outstandingCount,
                    'outstanding_total' => $outstandingTotal,
                    'total_amount' => $totalAmount,
                ],
            ],
        ]);
    }

    public function store(StoreInvoiceRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $dentistId = $this->resolveDentistId($request);

        $invoice = DB::transaction(function () use ($validated, $dentistId): Invoice {
            $this->assertOdontogramItemsBelongToPatient(
                items: $validated['items'],
                dentistId: $dentistId,
                patientId: (string) $validated['patient_id'],
            );
            $items = $this->buildInvoiceItems($validated['items']);
            $total = $this->calculateItemsTotal($items);

            $invoice = Invoice::create([
                'dentist_id' => $dentistId,
                'patient_id' => $validated['patient_id'],
                'invoice_number' => $this->generateInvoiceNumber($dentistId),
                'invoice_date' => $validated['invoice_date'],
                'due_date' => null,
                'total_amount' => $total,
                'paid_amount' => '0.00',
                'balance' => $total,
                'status' => Invoice::STATUS_UNPAID,
                'notes' => null,
            ]);

            $invoice->items()->createMany($items);

            return $invoice->load(['items', 'patient:id,full_name,phone']);
        });

        return response()->json([
            'data' => $this->transformInvoice($invoice, true),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $invoice = $this->findOwnedInvoice($request, $id)->load(['items', 'patient:id,full_name,phone']);

        return response()->json([
            'data' => $this->transformInvoice($invoice, true),
        ]);
    }

    public function update(UpdateInvoiceRequest $request, string $id): JsonResponse
    {
        $invoice = $this->findOwnedInvoice($request, $id);
        $validated = $request->validated();

        $updatedInvoice = DB::transaction(function () use ($invoice, $validated): Invoice {
            $this->assertOdontogramItemsBelongToPatient(
                items: $validated['items'],
                dentistId: (int) $invoice->dentist_id,
                patientId: (string) $validated['patient_id'],
            );
            $items = $this->buildInvoiceItems($validated['items']);
            $newTotal = $this->calculateItemsTotal($items);
            $paidAmount = $this->normalizeMoney($invoice->paid_amount);

            if (bccomp($newTotal, $paidAmount, 2) === -1) {
                throw ValidationException::withMessages([
                    'items' => [__('api.invoices.total_lower_than_paid')],
                ]);
            }

            $newBalance = bcsub($newTotal, $paidAmount, 2);
            $newStatus = $this->resolveInvoiceStatus($newTotal, $paidAmount);

            $invoice->update([
                'patient_id' => $validated['patient_id'],
                'invoice_date' => $validated['invoice_date'],
                'due_date' => null,
                'total_amount' => $newTotal,
                'balance' => $newBalance,
                'status' => $newStatus,
                'notes' => null,
            ]);

            $invoice->items()->delete();
            $invoice->items()->createMany($items);

            return $invoice->load(['items', 'patient:id,full_name,phone']);
        });

        return response()->json([
            'data' => $this->transformInvoice($updatedInvoice, true),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $invoice = $this->findOwnedInvoice($request, $id);

        if ($invoice->payments()->exists()) {
            throw ValidationException::withMessages([
                'invoice' => [__('api.invoices.cannot_delete_with_payments')],
            ]);
        }

        $invoice->delete();

        return response()->json([], 204);
    }

    public function download(Request $request, string $id): Response
    {
        $invoice = $this->findOwnedInvoice($request, $id)
            ->load(['patient:id,patient_id,full_name,phone', 'dentist:id,name,email,practice_name,phone,address', 'items', 'payments']);

        $pdf = $this->buildInvoicePdf($invoice);
        $filename = sprintf('%s.pdf', $invoice->invoice_number);

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => sprintf('attachment; filename="%s"', $filename),
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
        ]);
    }

    private function findOwnedInvoice(Request $request, string $id): Invoice
    {
        return Invoice::query()
            ->where('id', $id)
            ->where('dentist_id', $this->resolveDentistId($request))
            ->firstOrFail();
    }

    private function resolveDentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
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
            $query->orderByDesc('invoice_date');

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
            $query->orderByDesc('invoice_date');
        }
    }

    /**
     * @return list<string>
     */
    private function resolveStatusFilters(Request $request): array
    {
        $value = $request->input('filter.statuses');
        if (is_array($value)) {
            return array_values(
                array_filter($value, fn ($status): bool => is_string($status) && $status !== '')
            );
        }

        if (! is_string($value) || $value === '') {
            return [];
        }

        return array_values(
            array_filter(
                array_map('trim', explode(',', $value)),
                fn (string $status): bool => $status !== ''
            )
        );
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     * @return array<int, array<string, mixed>>
     */
    private function buildInvoiceItems(array $items): array
    {
        return collect($items)
            ->values()
            ->map(function (array $item, int $index): array {
                $quantity = (int) $item['quantity'];
                $unitPrice = $this->normalizeMoney($item['unit_price']);
                $lineTotal = bcmul((string) $quantity, $unitPrice, 2);

                return [
                    'odontogram_entry_id' => isset($item['odontogram_entry_id']) && is_string($item['odontogram_entry_id'])
                        ? $item['odontogram_entry_id']
                        : null,
                    'description' => $item['description'],
                    'quantity' => $quantity,
                    'unit_price' => $unitPrice,
                    'total_price' => $lineTotal,
                    'sort_order' => $index,
                ];
            })
            ->all();
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function calculateItemsTotal(array $items): string
    {
        return collect($items)->reduce(
            fn (string $carry, array $item): string => bcadd($carry, $this->normalizeMoney($item['total_price']), 2),
            '0.00'
        );
    }

    /**
     * @param  array<int, array<string, mixed>>  $items
     */
    private function assertOdontogramItemsBelongToPatient(array $items, int $dentistId, string $patientId): void
    {
        $entryIds = collect($items)
            ->pluck('odontogram_entry_id')
            ->filter(fn ($value): bool => is_string($value) && $value !== '')
            ->unique()
            ->values()
            ->all();

        if ($entryIds === []) {
            return;
        }

        $matchedCount = OdontogramEntry::query()
            ->where('dentist_id', $dentistId)
            ->where('patient_id', $patientId)
            ->whereIn('id', $entryIds)
            ->count();

        if ($matchedCount !== count($entryIds)) {
            throw ValidationException::withMessages([
                'items' => [__('api.invoices.invalid_odontogram_items')],
            ]);
        }
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

    /**
     * @return array<string, mixed>
     */
    private function transformInvoice(Invoice $invoice, bool $includeItems = false): array
    {
        $payload = [
            'id' => (string) $invoice->id,
            'patient_id' => (string) $invoice->patient_id,
            'patient_name' => $invoice->patient?->full_name,
            'patient_phone' => $invoice->patient?->phone,
            'invoice_number' => $invoice->invoice_number,
            'total_amount' => (float) $invoice->total_amount,
            'paid_amount' => (float) $invoice->paid_amount,
            'balance' => (float) $invoice->balance,
            'status' => $invoice->status,
            'invoice_date' => $invoice->invoice_date?->toDateString(),
            'due_date' => null,
            'notes' => null,
        ];

        if ($includeItems) {
            $payload['items'] = $invoice->items
                ->map(fn (InvoiceItem $item): array => [
                    'id' => (string) $item->id,
                    'description' => $item->description,
                    'odontogram_entry_id' => $item->odontogram_entry_id !== null ? (string) $item->odontogram_entry_id : null,
                    'quantity' => $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'total_price' => (float) $item->total_price,
                ])
                ->values()
                ->all();
        }

        return $payload;
    }

    private function normalizeMoney(mixed $value): string
    {
        return number_format((float) $value, 2, '.', '');
    }

    private function buildInvoicePdf(Invoice $invoice): string
    {
        $options = new Options();
        $options->set('defaultFont', 'DejaVu Sans');
        $options->set('isHtml5ParserEnabled', true);
        $options->set('isRemoteEnabled', false);
        $options->set('isPhpEnabled', false);
        $options->set('isFontSubsettingEnabled', true);

        $dompdf = new Dompdf($options);
        $html = view('pdf.invoice', $this->buildInvoicePdfViewData($invoice))->render();

        $dompdf->loadHtml($html, 'UTF-8');
        $dompdf->setPaper('A4', 'portrait');
        $dompdf->render();

        return $dompdf->output();
    }

    /**
     * @return array<string, mixed>
     */
    private function buildInvoicePdfViewData(Invoice $invoice): array
    {
        $providerName = trim((string) ($invoice->dentist?->practice_name ?: $invoice->dentist?->name ?: $this->tr('api.invoices_pdf.fallback_provider')));
        $providerContact = trim((string) ($invoice->dentist?->email ?: $invoice->dentist?->phone ?: ''));
        $patientName = trim((string) ($invoice->patient?->full_name ?? $this->tr('api.invoices_pdf.fallback_patient')));
        $patientCode = trim((string) ($invoice->patient?->patient_id ?? $this->tr('api.invoices_pdf.fallback_na')));
        $patientPhone = trim((string) ($invoice->patient?->phone ?? ''));

        $items = $invoice->items
            ->values()
            ->map(fn (InvoiceItem $item): array => [
                'description' => $item->description,
                'quantity' => (string) $item->quantity,
                'unit_price' => $this->formatMoney($item->unit_price),
                'total_price' => $this->formatMoney($item->total_price),
            ]);

        $payments = $invoice->payments
            ->sortByDesc('payment_date')
            ->values()
            ->map(fn ($payment): array => [
                'date' => $this->formatPdfDate($payment->payment_date),
                'method' => $this->translatePaymentMethod((string) $payment->payment_method),
                'amount' => $this->formatMoney($payment->amount),
            ]);

        return [
            'title' => $this->tr('api.invoices_pdf.title'),
            'invoice_number_line' => $this->tr('api.invoices_pdf.invoice_number', ['number' => $invoice->invoice_number]),
            'provider_label' => $this->tr('api.invoices_pdf.provider'),
            'patient_label' => $this->tr('api.invoices_pdf.patient'),
            'summary_label' => $this->tr('api.invoices_pdf.summary'),
            'invoice_date_label' => $this->tr('api.invoices_pdf.invoice_date', ['date' => $this->formatPdfDate($invoice->invoice_date)]),
            'status_label' => $this->tr('api.invoices_pdf.status', ['status' => $this->translateInvoiceStatus($invoice->status)]),
            'items_label' => $this->tr('api.invoices_pdf.items'),
            'payment_history_label' => $this->tr('api.invoices_pdf.payment_history'),
            'generated_by_label' => $this->tr('api.invoices_pdf.generated_by'),
            'headers' => [
                'description' => $this->tr('api.invoices_pdf.description'),
                'qty' => $this->tr('api.invoices_pdf.qty'),
                'unit' => $this->tr('api.invoices_pdf.unit'),
                'total' => $this->tr('api.invoices_pdf.total'),
                'date' => $this->tr('api.invoices_pdf.date'),
                'method' => $this->tr('api.invoices_pdf.method'),
                'amount' => $this->tr('api.invoices_pdf.amount'),
                'paid' => $this->tr('api.invoices_pdf.paid'),
                'balance' => $this->tr('api.invoices_pdf.balance'),
            ],
            'provider_name' => $providerName,
            'provider_contact' => $providerContact,
            'patient_name' => $patientName,
            'patient_line' => $this->tr('api.invoices_pdf.patient_line', [
                'id' => $patientCode,
                'phone' => $patientPhone,
                'phone_part' => $patientPhone !== '' ? " | {$patientPhone}" : '',
            ]),
            'items' => $items->all(),
            'payments' => $payments->all(),
            'no_payments_text' => $this->tr('api.invoices_pdf.no_payments'),
            'totals' => [
                'total' => $this->formatMoney($invoice->total_amount),
                'paid' => $this->formatMoney($invoice->paid_amount),
                'balance' => $this->formatMoney($invoice->balance),
            ],
            'generated_at' => now()->format('Y-m-d H:i'),
        ];
    }

    private function tr(string $key, array $replace = []): string
    {
        $translated = __($key, $replace);

        return is_string($translated) ? $translated : $key;
    }

    private function formatPdfDate(mixed $value): string
    {
        if ($value === null) {
            return $this->tr('api.invoices_pdf.fallback_na');
        }

        $dateString = method_exists($value, 'toDateString') ? (string) $value->toDateString() : (string) $value;
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateString) !== 1) {
            return $dateString !== '' ? $dateString : $this->tr('api.invoices_pdf.fallback_na');
        }

        $locale = app()->getLocale();
        if ($locale === 'ru' || $locale === 'uz') {
            [$year, $month, $day] = explode('-', $dateString);

            return "{$day}.{$month}.{$year}";
        }

        return $dateString;
    }

    private function translateInvoiceStatus(?string $status): string
    {
        $normalized = is_string($status) ? trim($status) : '';
        if ($normalized === '') {
            return $this->tr('api.invoices_pdf.fallback_na');
        }

        $key = "api.invoices_pdf.status_values.{$normalized}";
        $translated = $this->tr($key);

        return $translated === $key ? $this->humanizeValue($normalized) : $translated;
    }

    private function translatePaymentMethod(string $paymentMethod): string
    {
        $normalized = trim($paymentMethod);
        if ($normalized === '') {
            return $this->tr('api.invoices_pdf.fallback_na');
        }

        $key = "api.invoices_pdf.payment_methods.{$normalized}";
        $translated = $this->tr($key);

        return $translated === $key ? $this->humanizeValue($normalized) : $translated;
    }

    private function formatMoney(mixed $value): string
    {
        return number_format((float) $value, 2, '.', ',');
    }

    private function humanizeValue(string $value): string
    {
        return ucwords(str_replace('_', ' ', trim($value)));
    }

    private function generateInvoiceNumber(int $dentistId): string
    {
        $prefix = 'INV-'.now()->format('ym').'-';

        $existingNumbers = Invoice::query()
            ->where('dentist_id', $dentistId)
            ->where('invoice_number', 'like', $prefix.'%')
            ->lockForUpdate()
            ->pluck('invoice_number');

        $maxSequence = 0;
        foreach ($existingNumbers as $invoiceNumber) {
            if (! is_string($invoiceNumber)) {
                continue;
            }

            if (preg_match('/^INV-\d{4}-(\d{4})$/', $invoiceNumber, $matches) !== 1) {
                continue;
            }

            $sequence = (int) $matches[1];
            if ($sequence > $maxSequence) {
                $maxSequence = $sequence;
            }
        }

        $nextSequence = $maxSequence + 1;
        if ($nextSequence > 9999) {
            throw ValidationException::withMessages([
                'invoice_number' => [__('api.invoices.monthly_limit_reached')],
            ]);
        }

        return $prefix.str_pad((string) $nextSequence, 4, '0', STR_PAD_LEFT);
    }
}
