<?php

namespace App\Services;

use App\Http\Requests\StorePaymentExpenseRequest;
use App\Models\PaymentExpense;
use App\Models\User;
use App\Support\Search;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

class PaymentExpenseService
{
    private const DEFAULT_PER_PAGE = 10;

    private const MAX_PER_PAGE = 100;

    /**
     * @return array{
     *     expenses: LengthAwarePaginator,
     *     summary: array{total_count: int, total_amount: float, current_month_amount: float, totals_by_currency: array<string, float>, current_month_by_currency: array<string, float>, latest_expense_date: string|null}
     * }
     */
    public function list(Request $request): array
    {
        $query = $this->baseQuery($request);
        $summary = $this->summarize(clone $query);

        $query
            ->orderByDesc('expense_date')
            ->orderByDesc('created_at');

        return [
            'expenses' => $query->paginate($this->perPage($request)),
            'summary' => $summary,
        ];
    }

    /**
     * Creates a tenant-scoped expense from validated payments form input.
     *
     * @return array{expense: PaymentExpense, created: bool}
     */
    public function create(StorePaymentExpenseRequest $request): array
    {
        $validated = $request->validated();
        $attributes = $this->validatedAttributes($validated);
        $dentistId = $this->dentistId($request);
        $idempotencyKey = $this->idempotencyKey($request);

        if ($idempotencyKey === null) {
            return [
                'expense' => PaymentExpense::query()->create([
                    'dentist_id' => $dentistId,
                    ...$attributes,
                ]),
                'created' => true,
            ];
        }

        $payloadHash = $this->payloadHash($attributes);
        $expense = PaymentExpense::withTrashed()->firstOrCreate(
            [
                'dentist_id' => $dentistId,
                'idempotency_key' => $idempotencyKey,
            ],
            [
                ...$attributes,
                'idempotency_payload_hash' => $payloadHash,
            ]
        );

        if ($expense->trashed() || ! hash_equals(
            (string) $expense->idempotency_payload_hash,
            $payloadHash
        )) {
            throw ValidationException::withMessages([
                'idempotency_key' => [
                    'This idempotency key has already been used for a different expense.',
                ],
            ]);
        }

        return [
            'expense' => $expense,
            'created' => $expense->wasRecentlyCreated,
        ];
    }

    /**
     * Updates a tenant-scoped expense. The route id is never trusted without
     * the dentist_id scope, preventing cross-clinic edits by guessed UUID.
     */
    public function update(StorePaymentExpenseRequest $request, string $id): PaymentExpense
    {
        $expense = $this->expenseForTenant($request, $id);
        $validated = $request->validated();

        $expense->forceFill($this->validatedAttributes($validated))->save();

        return $expense->refresh();
    }

    /**
     * Deletes a tenant-scoped expense row.
     */
    public function delete(Request $request, string $id): PaymentExpense
    {
        $expense = $this->expenseForTenant($request, $id);
        $expense->delete();

        return $expense;
    }

    public function findForTenant(Request $request, string $id): PaymentExpense
    {
        return $this->expenseForTenant($request, $id);
    }

    private function baseQuery(Request $request): Builder
    {
        $query = PaymentExpense::query()->where('dentist_id', $this->dentistId($request));

        $search = $this->searchFilter($request);
        if ($search !== null) {
            $query->where(function (Builder $builder) use ($search): void {
                Search::ciLike($builder, 'title', $search);
            });
        }

        $dateFrom = $request->input('filter.date_from');
        if (is_string($dateFrom) && $dateFrom !== '') {
            $query->whereDate('expense_date', '>=', $dateFrom);
        }

        $dateTo = $request->input('filter.date_to');
        if (is_string($dateTo) && $dateTo !== '') {
            $query->whereDate('expense_date', '<=', $dateTo);
        }

        return $query;
    }

    /**
     * Legacy scalar totals are UZS-only. Adding USD and UZS produces a
     * dimensionally invalid amount, so currency-aware consumers must use the
     * *_by_currency fields.
     *
     * @return array{total_count: int, total_amount: float, current_month_amount: float, totals_by_currency: array<string, float>, current_month_by_currency: array<string, float>, latest_expense_date: string|null}
     */
    private function summarize(Builder $query): array
    {
        $currentMonthStart = Carbon::now()->startOfMonth()->toDateString();
        $currentMonthEnd = Carbon::now()->endOfMonth()->toDateString();

        $row = (clone $query)
            ->toBase()
            ->selectRaw('COUNT(*) AS total_count')
            ->selectRaw(
                'COALESCE(SUM(CASE WHEN COALESCE(currency, ?) = ? THEN amount ELSE 0 END), 0) AS total_amount',
                [PaymentExpense::CURRENCY_UZS, PaymentExpense::CURRENCY_UZS]
            )
            ->selectRaw(
                'COALESCE(SUM(CASE WHEN COALESCE(currency, ?) = ? AND expense_date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) AS current_month_amount',
                [
                    PaymentExpense::CURRENCY_UZS,
                    PaymentExpense::CURRENCY_UZS,
                    $currentMonthStart,
                    $currentMonthEnd,
                ]
            )
            ->selectRaw('MAX(expense_date) AS latest_expense_date')
            ->first();
        $totalsByCurrency = $this->emptyCurrencyTotals();
        $currentMonthByCurrency = $this->emptyCurrencyTotals();
        $currencyRows = (clone $query)
            ->toBase()
            ->selectRaw('currency')
            ->selectRaw('COALESCE(SUM(amount), 0) AS total_amount')
            ->selectRaw(
                'COALESCE(SUM(CASE WHEN expense_date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) AS current_month_amount',
                [$currentMonthStart, $currentMonthEnd]
            )
            ->groupBy('currency')
            ->get();

        foreach ($currencyRows as $currencyRow) {
            $currency = $this->currency(is_string($currencyRow->currency ?? null) ? $currencyRow->currency : null);
            $totalsByCurrency[$currency] = (float) ($currencyRow->total_amount ?? 0);
            $currentMonthByCurrency[$currency] = (float) ($currencyRow->current_month_amount ?? 0);
        }

        $latestExpenseDate = $row?->latest_expense_date
            ? Carbon::parse((string) $row->latest_expense_date)->toDateString()
            : null;

        return [
            'total_count' => (int) ($row?->total_count ?? 0),
            'total_amount' => (float) ($row?->total_amount ?? 0),
            'current_month_amount' => (float) ($row?->current_month_amount ?? 0),
            'totals_by_currency' => $totalsByCurrency,
            'current_month_by_currency' => $currentMonthByCurrency,
            'latest_expense_date' => $latestExpenseDate,
        ];
    }

    private function searchFilter(Request $request): ?string
    {
        $search = $request->input('filter.search');
        if (! is_string($search)) {
            return null;
        }

        $search = trim($search);

        return $search === '' ? null : $search;
    }

    private function perPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        return min($perPage, self::MAX_PER_PAGE);
    }

    private function dentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }

    private function expenseForTenant(Request $request, string $id): PaymentExpense
    {
        $expense = PaymentExpense::query()
            ->where('dentist_id', $this->dentistId($request))
            ->whereKey($id)
            ->first();

        if (! $expense instanceof PaymentExpense) {
            throw new NotFoundHttpException('Expense not found.');
        }

        return $expense;
    }

    /**
     * @return array<string, float>
     */
    private function emptyCurrencyTotals(): array
    {
        return array_fill_keys(PaymentExpense::CURRENCIES, 0.0);
    }

    private function currency(?string $currency): string
    {
        $normalized = strtoupper(trim((string) ($currency ?: PaymentExpense::CURRENCY_UZS)));

        return in_array($normalized, PaymentExpense::CURRENCIES, true)
            ? $normalized
            : PaymentExpense::CURRENCY_UZS;
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array{title: string, amount: mixed, quantity: mixed, currency: string, expense_date: mixed}
     */
    private function validatedAttributes(array $validated): array
    {
        return [
            'title' => trim((string) $validated['title']),
            'amount' => $validated['amount'],
            'quantity' => $validated['quantity'] ?? 1,
            'currency' => $this->currency($validated['currency'] ?? null),
            'expense_date' => $validated['expense_date'],
        ];
    }

    private function idempotencyKey(Request $request): ?string
    {
        $rawKey = $request->header('Idempotency-Key');
        if ($rawKey === null || trim($rawKey) === '') {
            return null;
        }

        $key = trim($rawKey);
        if (
            strlen($key) > 100
            || preg_match('/^[A-Za-z0-9._:-]+$/', $key) !== 1
        ) {
            throw ValidationException::withMessages([
                'idempotency_key' => [
                    'The Idempotency-Key header format is invalid.',
                ],
            ]);
        }

        return $key;
    }

    /**
     * @param  array{title: string, amount: mixed, quantity: mixed, currency: string, expense_date: mixed}  $attributes
     */
    private function payloadHash(array $attributes): string
    {
        $canonical = [
            'title' => $attributes['title'],
            'amount' => number_format((float) $attributes['amount'], 2, '.', ''),
            'quantity' => number_format((float) $attributes['quantity'], 2, '.', ''),
            'currency' => $attributes['currency'],
            'expense_date' => Carbon::parse((string) $attributes['expense_date'])->toDateString(),
        ];

        return hash('sha256', json_encode($canonical, JSON_THROW_ON_ERROR));
    }
}
