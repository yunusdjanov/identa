<?php

namespace App\Services;

use App\Http\Requests\StoreInvoiceRequest;
use App\Http\Requests\UpdateInvoiceRequest;
use App\Models\Invoice;
use App\Models\OdontogramEntry;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\Search;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InvoiceService
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {}

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

    /**
     * @return array{invoices: LengthAwarePaginator, summary: array<string, float|int>}
     */
    public function list(Request $request): array
    {
        $dentistId = $this->dentistId($request);
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

        $statuses = $this->statusFilters($request);
        if ($statuses !== []) {
            $query->whereIn('status', $statuses);
            $summaryQuery->whereIn('status', $statuses);
        }

        $search = $request->input('filter.search');
        if (is_string($search) && $search !== '') {
            $this->applySearch($query, $search);
            $this->applySearch($summaryQuery, $search);
        }

        $this->applySort($query, $request->query('sort', '-invoice_date'));
        $invoices = $query->paginate($this->perPage($request));

        return [
            'invoices' => $invoices,
            'summary' => [
                'total_count' => (clone $summaryQuery)->count(),
                'outstanding_count' => (clone $summaryQuery)
                    ->whereIn('status', self::OUTSTANDING_STATUSES)
                    ->count(),
                'outstanding_total' => (float) ((clone $summaryQuery)
                    ->whereIn('status', self::OUTSTANDING_STATUSES)
                    ->sum('balance')),
                'total_amount' => (float) ((clone $summaryQuery)->sum('total_amount')),
            ],
        ];
    }

    public function create(StoreInvoiceRequest $request): Invoice
    {
        $validated = $request->validated();
        $dentistId = $this->dentistId($request);

        $invoice = DB::transaction(function () use ($validated, $dentistId): Invoice {
            $this->assertOdontogramItemsBelongToPatient(
                items: $validated['items'],
                dentistId: $dentistId,
                patientId: (string) $validated['patient_id'],
            );
            $items = $this->buildItems($validated['items']);
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

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'invoice.created',
            entityType: 'invoice',
            entityId: (string) $invoice->id,
            metadata: [
                'patient_id' => (string) $invoice->patient_id,
                'invoice_number' => $invoice->invoice_number,
                'total_amount' => (float) $invoice->total_amount,
            ],
        );

        return $invoice;
    }

    public function update(UpdateInvoiceRequest $request, string $id): Invoice
    {
        $validated = $request->validated();
        $dentistId = $this->dentistId($request);

        $invoice = DB::transaction(function () use ($id, $dentistId, $validated): Invoice {
            // Lock the invoice row inside the transaction so a concurrent
            // PaymentService::create / refund cannot commit a paid_amount
            // delta between our read and our write. Without the lock, the
            // recomputed balance below would be based on a stale paid_amount
            // snapshot and we'd overwrite the new payment's effect.
            $invoice = Invoice::query()
                ->where('id', $id)
                ->where('dentist_id', $dentistId)
                ->lockForUpdate()
                ->firstOrFail();

            $this->assertOdontogramItemsBelongToPatient(
                items: $validated['items'],
                dentistId: (int) $invoice->dentist_id,
                patientId: (string) $validated['patient_id'],
            );
            $items = $this->buildItems($validated['items']);
            $newTotal = $this->calculateItemsTotal($items);
            $paidAmount = $this->normalizeMoney($invoice->paid_amount);

            if (bccomp($newTotal, $paidAmount, 2) === -1) {
                throw ValidationException::withMessages([
                    'items' => [__('api.invoices.total_lower_than_paid')],
                ]);
            }

            $newBalance = bcsub($newTotal, $paidAmount, 2);
            $newStatus = $this->resolveStatus($newTotal, $paidAmount);

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

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'invoice.updated',
            entityType: 'invoice',
            entityId: (string) $invoice->id,
            metadata: [
                'patient_id' => (string) $invoice->patient_id,
                'invoice_number' => $invoice->invoice_number,
                'total_amount' => (float) $invoice->total_amount,
                'status' => $invoice->status,
            ],
        );

        return $invoice;
    }

    public function delete(Request $request, string $id): void
    {
        $invoice = $this->ownedInvoice($request, $id);

        if ($invoice->payments()->exists()) {
            throw ValidationException::withMessages([
                'invoice' => [__('api.invoices.cannot_delete_with_payments')],
            ]);
        }

        $metadata = [
            'patient_id' => (string) $invoice->patient_id,
            'invoice_number' => $invoice->invoice_number,
            'total_amount' => (float) $invoice->total_amount,
        ];
        $invoice->delete();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'invoice.deleted',
            entityType: 'invoice',
            entityId: (string) $invoice->id,
            metadata: $metadata,
        );
    }

    public function ownedInvoice(Request $request, string $id): Invoice
    {
        return Invoice::query()
            ->where('id', $id)
            ->where('dentist_id', $this->dentistId($request))
            ->firstOrFail();
    }

    public function invoiceForPdf(Request $request, string $id): Invoice
    {
        return $this->ownedInvoice($request, $id)
            ->load(['patient:id,patient_id,full_name,phone', 'dentist:id,name,email,practice_name,phone,address', 'items', 'payments']);
    }

    public function dentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }

    private function applySearch(Builder $query, string $search): void
    {
        // Case-insensitive on every supported DB. invoice_number is normally
        // numeric-with-prefix (e.g. "INV-2025-...") so case rarely matters
        // there, but patient name / patient_id do — and a uniform helper
        // avoids reasoning about which columns need it.
        $query->where(function (Builder $builder) use ($search): void {
            Search::ciLike($builder, 'invoice_number', $search);
            $builder->orWhereHas('patient', function (Builder $patientQuery) use ($search): void {
                Search::ciLike($patientQuery, 'full_name', $search);
                Search::ciLike($patientQuery, 'patient_id', $search, 'or');
            });
        });
    }

    private function perPage(Request $request): int
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
    private function statusFilters(Request $request): array
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
    private function buildItems(array $items): array
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

    private function resolveStatus(string $totalAmount, string $paidAmount): string
    {
        if (bccomp($paidAmount, '0.00', 2) <= 0) {
            return Invoice::STATUS_UNPAID;
        }

        if (bccomp($paidAmount, $totalAmount, 2) >= 0) {
            return Invoice::STATUS_PAID;
        }

        return Invoice::STATUS_PARTIALLY_PAID;
    }

    private function normalizeMoney(mixed $value): string
    {
        return number_format((float) $value, 2, '.', '');
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
            $sequence = (int) substr((string) $invoiceNumber, strlen($prefix));
            $maxSequence = max($maxSequence, $sequence);
        }

        return $prefix.str_pad((string) ($maxSequence + 1), 4, '0', STR_PAD_LEFT);
    }
}
