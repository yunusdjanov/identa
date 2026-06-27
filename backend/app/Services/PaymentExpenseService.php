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
     */
    public function create(StorePaymentExpenseRequest $request): PaymentExpense
    {
        $validated = $request->validated();

        return PaymentExpense::query()->create([
            'dentist_id' => $this->dentistId($request),
            'title' => trim((string) $validated['title']),
            'amount' => $validated['amount'],
            'quantity' => $validated['quantity'] ?? 1,
            'currency' => $this->currency($validated['currency'] ?? null),
            'expense_date' => $validated['expense_date'],
        ]);
    }

    /**
     * Updates a tenant-scoped expense. The route id is never trusted without
     * the dentist_id scope, preventing cross-clinic edits by guessed UUID.
     */
    public function update(StorePaymentExpenseRequest $request, string $id): PaymentExpense
    {
        $expense = $this->expenseForTenant($request, $id);
        $validated = $request->validated();

        $expense->forceFill([
            'title' => trim((string) $validated['title']),
            'amount' => $validated['amount'],
            'quantity' => $validated['quantity'] ?? 1,
            'currency' => $this->currency($validated['currency'] ?? null),
            'expense_date' => $validated['expense_date'],
        ])->save();

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
     * @return array{total_count: int, total_amount: float, current_month_amount: float, totals_by_currency: array<string, float>, current_month_by_currency: array<string, float>, latest_expense_date: string|null}
     */
    private function summarize(Builder $query): array
    {
        $currentMonthStart = Carbon::now()->startOfMonth()->toDateString();
        $currentMonthEnd = Carbon::now()->endOfMonth()->toDateString();

        $row = (clone $query)
            ->toBase()
            ->selectRaw('COUNT(*) AS total_count')
            ->selectRaw('COALESCE(SUM(amount), 0) AS total_amount')
            ->selectRaw(
                'COALESCE(SUM(CASE WHEN expense_date BETWEEN ? AND ? THEN amount ELSE 0 END), 0) AS current_month_amount',
                [$currentMonthStart, $currentMonthEnd]
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
}
