<?php

namespace App\Services;

use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use App\Support\Search;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PaymentLedgerService
{
    private const DEFAULT_PER_PAGE = 10;
    private const MAX_PER_PAGE = 100;
    private const BALANCE_EXPRESSION = '(COALESCE(SUM(CASE WHEN COALESCE(treatments.currency, ?) = ? THEN treatments.debt_amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN COALESCE(treatments.currency, ?) = ? THEN treatments.paid_amount ELSE 0 END), 0))';

    /**
     * Return patient-level balances for the payments screen without loading
     * every treatment row into the browser.
     *
     * @return array{
     *     rows: LengthAwarePaginator,
     *     summary: array{total_debt: float, total_paid: float, total_balance: float, total_patients: int, total_entries: int, totals_by_currency: array<string, array{total_debt: float, total_paid: float, total_balance: float}>}
     * }
     */
    public function listPatientBalances(Request $request): array
    {
        $query = $this->patientBalanceQuery($request);
        $summary = $this->includeSummary($request)
            ? $this->summarizePatientBalances(clone $query)
            : null;

        $uzsBalance = $this->balanceExpression(Treatment::CURRENCY_UZS);
        $usdBalance = $this->balanceExpression(Treatment::CURRENCY_USD);

        $query
            // PostgreSQL only permits a SELECT alias as a standalone ORDER BY
            // item. Wrapping the alias in ABS() is treated as a column lookup
            // and fails with "column balance_uzs does not exist". Reusing the
            // aggregate expression keeps credit balances sorted by magnitude
            // and remains portable across PostgreSQL and SQLite.
            ->orderByRaw('ABS('.$uzsBalance['sql'].') DESC', $uzsBalance['bindings'])
            ->orderByRaw('ABS('.$usdBalance['sql'].') DESC', $usdBalance['bindings'])
            ->orderByDesc('last_entry_date')
            ->orderBy('patients.full_name');

        return [
            'rows' => $query->paginate($this->perPage($request)),
            'summary' => $summary,
        ];
    }

    /**
     * Return paginated treatment-ledger rows for the payments history tab.
     *
     * @return array{
     *     rows: LengthAwarePaginator,
     *     summary: array{total_debt: float, total_paid: float, total_balance: float, total_entries: int, totals_by_currency: array<string, array{total_debt: float, total_paid: float, total_balance: float}>}
     * }
     */
    public function listHistoryRows(Request $request): array
    {
        $query = $this->historyQuery($request);
        $summary = $this->includeSummary($request)
            ? $this->summarizeHistoryRows(clone $query)
            : null;

        $query
            ->with([
                'patient:id,full_name,phone,secondary_phone,patient_id',
                'createdBy:id,name,role',
                'updatedBy:id,name,role',
            ])
            ->orderByDesc('treatment_date')
            ->orderByDesc('created_at');

        return [
            'rows' => $query->paginate($this->perPage($request)),
            'summary' => $summary,
        ];
    }

    private function patientBalanceQuery(Request $request): Builder
    {
        $dentistId = $this->dentistId($request);
        $patientId = $this->patientIdFilter($request);
        $uzsBalance = $this->balanceExpression(Treatment::CURRENCY_UZS);
        $usdBalance = $this->balanceExpression(Treatment::CURRENCY_USD);
        $query = Patient::query()
            ->when(
                $patientId !== null,
                fn (Builder $builder): Builder => $builder->leftJoin('treatments', function ($join) use ($dentistId): void {
                    $join->on('patients.id', '=', 'treatments.patient_id')
                        ->where('treatments.dentist_id', '=', $dentistId);
                }),
                fn (Builder $builder): Builder => $builder->join('treatments', function ($join) use ($dentistId): void {
                    $join->on('patients.id', '=', 'treatments.patient_id')
                        ->where('treatments.dentist_id', '=', $dentistId);
                })
            )
            ->where('patients.dentist_id', $dentistId)
            ->select([
                'patients.id',
                'patients.patient_id as patient_code',
                'patients.full_name',
                'patients.phone',
                'patients.secondary_phone',
                'patients.address',
                'patients.date_of_birth',
                'patients.photo_disk',
                'patients.photo_path',
                'patients.scan_status',
                'patients.quarantine_path',
                'patients.updated_at',
            ])
            ->selectRaw('COALESCE(SUM(CASE WHEN COALESCE(treatments.currency, ?) = ? THEN treatments.debt_amount ELSE 0 END), 0) AS total_debt_uzs', [
                Treatment::CURRENCY_UZS,
                Treatment::CURRENCY_UZS,
            ])
            ->selectRaw('COALESCE(SUM(CASE WHEN COALESCE(treatments.currency, ?) = ? THEN treatments.paid_amount ELSE 0 END), 0) AS total_paid_uzs', [
                Treatment::CURRENCY_UZS,
                Treatment::CURRENCY_UZS,
            ])
            ->selectRaw($uzsBalance['sql'].' AS balance_uzs', $uzsBalance['bindings'])
            ->selectRaw('COALESCE(SUM(CASE WHEN COALESCE(treatments.currency, ?) = ? THEN treatments.debt_amount ELSE 0 END), 0) AS total_debt_usd', [
                Treatment::CURRENCY_UZS,
                Treatment::CURRENCY_USD,
            ])
            ->selectRaw('COALESCE(SUM(CASE WHEN COALESCE(treatments.currency, ?) = ? THEN treatments.paid_amount ELSE 0 END), 0) AS total_paid_usd', [
                Treatment::CURRENCY_UZS,
                Treatment::CURRENCY_USD,
            ])
            ->selectRaw($usdBalance['sql'].' AS balance_usd', $usdBalance['bindings'])
            ->selectRaw('COUNT(treatments.id) AS entry_count')
            ->selectRaw('MAX(treatments.treatment_date) AS last_entry_date')
            ->groupBy([
                'patients.id',
                'patients.patient_id',
                'patients.full_name',
                'patients.phone',
                'patients.secondary_phone',
                'patients.address',
                'patients.date_of_birth',
                'patients.photo_disk',
                'patients.photo_path',
                'patients.scan_status',
                'patients.quarantine_path',
                'patients.updated_at',
            ]);

        $this->applyPatientFilters($query, $request);

        if ($this->outstandingOnly($request)) {
            $query->havingRaw(
                '((COALESCE(SUM(CASE WHEN COALESCE(treatments.currency, ?) = ? THEN treatments.debt_amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN COALESCE(treatments.currency, ?) = ? THEN treatments.paid_amount ELSE 0 END), 0)) > 0 OR (COALESCE(SUM(CASE WHEN COALESCE(treatments.currency, ?) = ? THEN treatments.debt_amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN COALESCE(treatments.currency, ?) = ? THEN treatments.paid_amount ELSE 0 END), 0)) > 0)',
                [
                    Treatment::CURRENCY_UZS,
                    Treatment::CURRENCY_UZS,
                    Treatment::CURRENCY_UZS,
                    Treatment::CURRENCY_UZS,
                    Treatment::CURRENCY_UZS,
                    Treatment::CURRENCY_USD,
                    Treatment::CURRENCY_UZS,
                    Treatment::CURRENCY_USD,
                ]
            );
        }
        return $query;
    }

    /**
     * @return array{sql: string, bindings: array<int, string>}
     */
    private function balanceExpression(string $currency): array
    {
        return [
            'sql' => self::BALANCE_EXPRESSION,
            'bindings' => [
                Treatment::CURRENCY_UZS,
                $currency,
                Treatment::CURRENCY_UZS,
                $currency,
            ],
        ];
    }

    private function historyQuery(Request $request): Builder
    {
        $dentistId = $this->dentistId($request);
        $query = Treatment::query()
            ->where('dentist_id', $dentistId);

        $patientId = $this->patientIdFilter($request);
        if ($patientId !== null) {
            $query->where('patient_id', $patientId);
        }

        $search = $this->searchFilter($request);
        if ($search !== null) {
            $query->where(function (Builder $builder) use ($search): void {
                Search::ciLike($builder, 'treatment_type', $search);
                Search::ciLike($builder, 'comment', $search, 'or');
                Search::ciLike($builder, 'description', $search, 'or');

                $toothNumber = $this->toothSearchNumber($search);
                if ($toothNumber !== null) {
                    $builder
                        ->orWhere('tooth_number', $toothNumber)
                        ->orWhereJsonContains('teeth', $toothNumber);
                }

                $builder->orWhereHas('patient', function (Builder $patientBuilder) use ($search): void {
                    Search::ciLike($patientBuilder, 'full_name', $search);
                    Search::ciLike($patientBuilder, 'phone', $search, 'or');
                    Search::ciLike($patientBuilder, 'secondary_phone', $search, 'or');
                    Search::ciLike($patientBuilder, 'patient_id', $search, 'or');
                });
            });
        }

        if ($this->outstandingOnly($request)) {
            $query->whereIn('patient_id', $this->outstandingPatientIdsSubquery($dentistId));
        }
        return $query;
    }

    private function applyPatientFilters(Builder $query, Request $request): void
    {
        $patientId = $this->patientIdFilter($request);
        if ($patientId !== null) {
            $query->where('patients.id', $patientId);
        }

        $search = $this->searchFilter($request);
        if ($search === null) {
            return;
        }
        $query->where(function (Builder $builder) use ($search): void {
            Search::ciLike($builder, 'patients.full_name', $search);
            Search::ciLike($builder, 'patients.phone', $search, 'or');
            Search::ciLike($builder, 'patients.secondary_phone', $search, 'or');
            Search::ciLike($builder, 'patients.patient_id', $search, 'or');
        });
    }

    /**
     * @return array{total_debt: float, total_paid: float, total_balance: float, total_patients: int, total_entries: int, totals_by_currency: array<string, array{total_debt: float, total_paid: float, total_balance: float}>}
     */
    private function summarizePatientBalances(Builder $query): array
    {
        $row = DB::query()
            ->fromSub($query->toBase(), 'payment_ledger_patients')
            ->selectRaw('COALESCE(SUM(total_debt_uzs), 0) AS total_debt')
            ->selectRaw('COALESCE(SUM(total_paid_uzs), 0) AS total_paid')
            ->selectRaw('COALESCE(SUM(balance_uzs), 0) AS total_balance')
            ->selectRaw('COALESCE(SUM(total_debt_usd), 0) AS total_debt_usd')
            ->selectRaw('COALESCE(SUM(total_paid_usd), 0) AS total_paid_usd')
            ->selectRaw('COALESCE(SUM(balance_usd), 0) AS total_balance_usd')
            ->selectRaw('COUNT(*) AS total_patients')
            ->selectRaw('COALESCE(SUM(entry_count), 0) AS total_entries')
            ->first();

        return [
            'total_debt' => (float) ($row?->total_debt ?? 0),
            'total_paid' => (float) ($row?->total_paid ?? 0),
            'total_balance' => (float) ($row?->total_balance ?? 0),
            'total_patients' => (int) ($row?->total_patients ?? 0),
            'total_entries' => (int) ($row?->total_entries ?? 0),
            'totals_by_currency' => [
                Treatment::CURRENCY_UZS => [
                    'total_debt' => (float) ($row?->total_debt ?? 0),
                    'total_paid' => (float) ($row?->total_paid ?? 0),
                    'total_balance' => (float) ($row?->total_balance ?? 0),
                ],
                Treatment::CURRENCY_USD => [
                    'total_debt' => (float) ($row?->total_debt_usd ?? 0),
                    'total_paid' => (float) ($row?->total_paid_usd ?? 0),
                    'total_balance' => (float) ($row?->total_balance_usd ?? 0),
                ],
            ],
        ];
    }

    /**
     * @return array{total_debt: float, total_paid: float, total_balance: float, total_entries: int, totals_by_currency: array<string, array{total_debt: float, total_paid: float, total_balance: float}>}
     */
    private function summarizeHistoryRows(Builder $query): array
    {
        $row = (clone $query)
            ->toBase()
            ->selectRaw(
                'COALESCE(SUM(CASE WHEN COALESCE(currency, ?) = ? THEN debt_amount ELSE 0 END), 0) AS total_debt_uzs',
                [Treatment::CURRENCY_UZS, Treatment::CURRENCY_UZS]
            )
            ->selectRaw(
                'COALESCE(SUM(CASE WHEN COALESCE(currency, ?) = ? THEN paid_amount ELSE 0 END), 0) AS total_paid_uzs',
                [Treatment::CURRENCY_UZS, Treatment::CURRENCY_UZS]
            )
            ->selectRaw(
                'COALESCE(SUM(CASE WHEN COALESCE(currency, ?) = ? THEN debt_amount ELSE 0 END), 0) AS total_debt_usd',
                [Treatment::CURRENCY_UZS, Treatment::CURRENCY_USD]
            )
            ->selectRaw(
                'COALESCE(SUM(CASE WHEN COALESCE(currency, ?) = ? THEN paid_amount ELSE 0 END), 0) AS total_paid_usd',
                [Treatment::CURRENCY_UZS, Treatment::CURRENCY_USD]
            )
            ->selectRaw('COUNT(*) AS total_entries')
            ->first();
        $uzsDebt = (float) ($row?->total_debt_uzs ?? 0);
        $uzsPaid = (float) ($row?->total_paid_uzs ?? 0);
        $usdDebt = (float) ($row?->total_debt_usd ?? 0);
        $usdPaid = (float) ($row?->total_paid_usd ?? 0);

        return [
            'total_debt' => $uzsDebt,
            'total_paid' => $uzsPaid,
            'total_balance' => $uzsDebt - $uzsPaid,
            'total_entries' => (int) ($row?->total_entries ?? 0),
            'totals_by_currency' => [
                Treatment::CURRENCY_UZS => [
                    'total_debt' => $uzsDebt,
                    'total_paid' => $uzsPaid,
                    'total_balance' => $uzsDebt - $uzsPaid,
                ],
                Treatment::CURRENCY_USD => [
                    'total_debt' => $usdDebt,
                    'total_paid' => $usdPaid,
                    'total_balance' => $usdDebt - $usdPaid,
                ],
            ],
        ];
    }

    private function outstandingPatientIdsSubquery(int $dentistId): \Closure
    {
        return function ($query) use ($dentistId): void {
            $query
                ->select('patient_id')
                ->from('treatments')
                ->where('dentist_id', $dentistId)
                ->groupBy('patient_id')
                ->havingRaw(
                    '((COALESCE(SUM(CASE WHEN COALESCE(currency, ?) = ? THEN debt_amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN COALESCE(currency, ?) = ? THEN paid_amount ELSE 0 END), 0)) > 0 OR (COALESCE(SUM(CASE WHEN COALESCE(currency, ?) = ? THEN debt_amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN COALESCE(currency, ?) = ? THEN paid_amount ELSE 0 END), 0)) > 0)',
                    [
                        Treatment::CURRENCY_UZS,
                        Treatment::CURRENCY_UZS,
                        Treatment::CURRENCY_UZS,
                        Treatment::CURRENCY_UZS,
                        Treatment::CURRENCY_UZS,
                        Treatment::CURRENCY_USD,
                        Treatment::CURRENCY_UZS,
                        Treatment::CURRENCY_USD,
                    ]
                );
        };
    }

    private function patientIdFilter(Request $request): ?string
    {
        $patientId = $request->input('filter.patient_id');

        return is_string($patientId) && $patientId !== '' ? $patientId : null;
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

    private function outstandingOnly(Request $request): bool
    {
        $outstanding = $request->input('filter.outstanding');

        if (is_string($outstanding)) {
            return in_array(strtolower($outstanding), ['1', 'true', 'yes', 'on'], true);
        }

        if (is_bool($outstanding)) {
            return $outstanding;
        }

        if (is_numeric($outstanding)) {
            return (int) $outstanding !== 0;
        }

        return false;
    }

    private function toothSearchNumber(string $search): ?int
    {
        if (! ctype_digit($search)) {
            return null;
        }

        $toothNumber = (int) $search;

        return $toothNumber >= 1 && $toothNumber <= 99 ? $toothNumber : null;
    }

    private function perPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        return min($perPage, self::MAX_PER_PAGE);
    }

    private function includeSummary(Request $request): bool
    {
        return ! $request->has('include_summary') || $request->boolean('include_summary');
    }

    private function dentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }
}
