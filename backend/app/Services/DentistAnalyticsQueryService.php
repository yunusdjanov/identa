<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\Treatment;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Database-side analytics projections. Every query returns a bounded aggregate
 * instead of materialising tenant history in PHP.
 */
class DentistAnalyticsQueryService
{
    private const TOP_DEBTORS_LIMIT = 4;

    public function revenueKpi(
        int $dentistId,
        string $currency,
        Carbon $currentStart,
        Carbon $currentEnd,
        Carbon $previousStart,
        Carbon $previousEnd,
    ): array {
        $query = Treatment::query()->where('dentist_id', $dentistId);
        $this->applyCurrency($query, $currency);

        $row = $query->selectRaw(
            'COALESCE(SUM(CASE WHEN treatment_date >= ? AND treatment_date < ? THEN paid_amount ELSE 0 END), 0) AS current_revenue',
            [$currentStart->toDateString(), $this->endExclusive($currentEnd)]
        )->selectRaw(
            'COALESCE(SUM(CASE WHEN treatment_date >= ? AND treatment_date < ? THEN paid_amount ELSE 0 END), 0) AS previous_revenue',
            [$previousStart->toDateString(), $this->endExclusive($previousEnd)]
        )->first();

        return [
            'current' => (float) ($row?->current_revenue ?? 0),
            'previous' => (float) ($row?->previous_revenue ?? 0),
        ];
    }

    public function patientKpi(
        int $dentistId,
        Carbon $currentStart,
        Carbon $currentEnd,
        Carbon $previousStart,
        Carbon $previousEnd,
    ): array {
        $row = Patient::query()
            ->where('dentist_id', $dentistId)
            ->selectRaw(
                'SUM(CASE WHEN created_at >= ? AND created_at <= ? THEN 1 ELSE 0 END) AS current_patients',
                [$currentStart, $currentEnd]
            )
            ->selectRaw(
                'SUM(CASE WHEN created_at >= ? AND created_at <= ? THEN 1 ELSE 0 END) AS previous_patients',
                [$previousStart, $previousEnd]
            )
            ->first();

        return [
            'current' => (int) ($row?->current_patients ?? 0),
            'previous' => (int) ($row?->previous_patients ?? 0),
        ];
    }

    public function visitsKpi(
        int $dentistId,
        bool $includeAppointments,
        bool $includeTreatments,
        Carbon $currentStart,
        Carbon $currentEnd,
        Carbon $previousStart,
        Carbon $previousEnd,
    ): array {
        return [
            'current' => $this->visitCount($dentistId, $includeAppointments, $includeTreatments, $currentStart, $currentEnd),
            'previous' => $this->visitCount($dentistId, $includeAppointments, $includeTreatments, $previousStart, $previousEnd),
        ];
    }

    public function outstandingDebtTotal(int $dentistId, string $currency): float
    {
        $patientBalances = Treatment::query()
            ->where('dentist_id', $dentistId);
        $this->applyCurrency($patientBalances, $currency);

        $patientBalances->selectRaw(
            'patient_id, COALESCE(SUM(debt_amount), 0) AS total_debt, COALESCE(SUM(paid_amount), 0) AS total_paid'
        )->groupBy('patient_id');

        return (float) DB::query()
            ->fromSub($patientBalances->toBase(), 'analytics_patient_balances')
            ->selectRaw('COALESCE(SUM(CASE WHEN total_debt - total_paid > 0 THEN total_debt - total_paid ELSE 0 END), 0) AS total')
            ->value('total');
    }

    /**
     * @param list<array{key: string, start: Carbon, end: Carbon}> $buckets
     * @return list<array{key: string, revenue: float, debt: float, new_patients: int, cumulative_patients: int}>
     */
    public function bucketRows(
        int $dentistId,
        string $currency,
        bool $includePayments,
        bool $includePatients,
        array $buckets,
        Carbon $rangeStart,
        Carbon $rangeEnd,
    ): array {
        $rows = [];
        $bucketByDate = [];

        foreach ($buckets as $bucket) {
            $rows[$bucket['key']] = [
                'key' => $bucket['key'],
                'revenue' => 0.0,
                'debt' => 0.0,
                'new_patients' => 0,
                'cumulative_patients' => 0,
            ];

            // Carbon::max/min may return the argument instance. Copy again so
            // the cursor loop cannot mutate the caller's range boundaries.
            $cursor = $bucket['start']->copy()->max($rangeStart)->copy()->startOfDay();
            $end = $bucket['end']->copy()->min($rangeEnd)->copy()->endOfDay();
            while ($cursor <= $end) {
                $bucketByDate[$cursor->toDateString()] = $bucket['key'];
                $cursor->addDay();
            }
        }

        if ($includePayments) {
            $financialQuery = Treatment::query()
                ->where('dentist_id', $dentistId)
                ->where('treatment_date', '>=', $rangeStart->toDateString())
                ->where('treatment_date', '<', $this->endExclusive($rangeEnd));
            $this->applyCurrency($financialQuery, $currency);

            $financialRows = $financialQuery
                ->selectRaw('treatment_date AS aggregate_date')
                ->selectRaw('COALESCE(SUM(paid_amount), 0) AS revenue')
                ->selectRaw('COALESCE(SUM(CASE WHEN debt_amount - paid_amount > 0 THEN debt_amount - paid_amount ELSE 0 END), 0) AS debt')
                ->groupBy('treatment_date')
                ->get();

            foreach ($financialRows as $financialRow) {
                $key = $bucketByDate[Carbon::parse((string) $financialRow->aggregate_date)->toDateString()] ?? null;
                if ($key !== null) {
                    $rows[$key]['revenue'] += (float) $financialRow->revenue;
                    $rows[$key]['debt'] += (float) $financialRow->debt;
                }
            }
        }

        if ($includePatients) {
            $patientRows = Patient::query()
                ->where('dentist_id', $dentistId)
                ->whereBetween('created_at', [$rangeStart, $rangeEnd])
                ->selectRaw('DATE(created_at) AS aggregate_date, COUNT(*) AS patient_count')
                ->groupByRaw('DATE(created_at)')
                ->get();

            foreach ($patientRows as $patientRow) {
                $key = $bucketByDate[(string) $patientRow->aggregate_date] ?? null;
                if ($key !== null) {
                    $rows[$key]['new_patients'] += (int) $patientRow->patient_count;
                }
            }
        }

        $cumulative = 0;
        foreach ($buckets as $bucket) {
            $cumulative += $rows[$bucket['key']]['new_patients'];
            $rows[$bucket['key']]['cumulative_patients'] = $cumulative;
        }

        return array_values($rows);
    }

    public function appointmentStatus(int $dentistId, bool $includeAppointments, Carbon $start, Carbon $end): array
    {
        $counts = array_fill_keys([
            Appointment::STATUS_SCHEDULED,
            Appointment::STATUS_COMPLETED,
            Appointment::STATUS_CANCELLED,
            Appointment::STATUS_NO_SHOW,
        ], 0);

        if ($includeAppointments) {
            Appointment::query()
                ->where('dentist_id', $dentistId)
                ->where('appointment_date', '>=', $start->toDateString())
                ->where('appointment_date', '<', $this->endExclusive($end))
                ->selectRaw('status, COUNT(*) AS status_count')
                ->groupBy('status')
                ->get()
                ->each(function (object $row) use (&$counts): void {
                    if (array_key_exists((string) $row->status, $counts)) {
                        $counts[(string) $row->status] = (int) $row->status_count;
                    }
                });
        }

        return collect($counts)
            ->map(fn (int $count, string $status): array => ['status' => $status, 'count' => $count])
            ->values()
            ->all();
    }

    public function topDebtors(
        int $dentistId,
        string $currency,
        bool $includePayments,
        Carbon $start,
        Carbon $end,
    ): array {
        if (! $includePayments) {
            return [];
        }

        $query = Treatment::query()
            ->join('patients', function ($join): void {
                $join->on('patients.id', '=', 'treatments.patient_id')
                    ->on('patients.dentist_id', '=', 'treatments.dentist_id');
            })
            ->where('treatments.dentist_id', $dentistId)
            ->where('treatments.treatment_date', '>=', $start->toDateString())
            ->where('treatments.treatment_date', '<', $this->endExclusive($end));
        $this->applyCurrency($query, $currency, 'treatments.currency');

        return $query
            ->select(['patients.id', 'patients.full_name', 'patients.phone'])
            ->selectRaw('SUM(CASE WHEN treatments.debt_amount - treatments.paid_amount > 0 THEN treatments.debt_amount - treatments.paid_amount ELSE 0 END) AS debt')
            ->groupBy(['patients.id', 'patients.full_name', 'patients.phone'])
            ->havingRaw('SUM(CASE WHEN treatments.debt_amount - treatments.paid_amount > 0 THEN treatments.debt_amount - treatments.paid_amount ELSE 0 END) > 0')
            ->orderByDesc('debt')
            ->limit(self::TOP_DEBTORS_LIMIT)
            ->get()
            ->map(fn (object $row): array => [
                'name' => (string) $row->full_name,
                'phone' => (string) ($row->phone ?? ''),
                'debt' => (float) $row->debt,
            ])
            ->all();
    }

    private function visitCount(
        int $dentistId,
        bool $includeAppointments,
        bool $includeTreatments,
        Carbon $start,
        Carbon $end,
    ): int {
        $visits = null;

        if ($includeAppointments) {
            $visits = Appointment::query()
                ->where('dentist_id', $dentistId)
                ->where('status', Appointment::STATUS_COMPLETED)
                ->where('appointment_date', '>=', $start->toDateString())
                ->where('appointment_date', '<', $this->endExclusive($end))
                ->selectRaw("CASE WHEN patient_id IS NULL THEN 'guest-appointment:' || CAST(id AS TEXT) ELSE 'patient:' || CAST(patient_id AS TEXT) END AS identity")
                ->selectRaw('appointment_date AS visit_day')
                ->toBase();
        }

        if ($includeTreatments) {
            $treatmentVisits = Treatment::query()
                ->where('dentist_id', $dentistId)
                ->whereNotNull('patient_id')
                ->where('treatment_date', '>=', $start->toDateString())
                ->where('treatment_date', '<', $this->endExclusive($end))
                ->selectRaw("'patient:' || CAST(patient_id AS TEXT) AS identity")
                ->selectRaw('treatment_date AS visit_day')
                ->toBase();

            $visits = $visits === null ? $treatmentVisits : $visits->unionAll($treatmentVisits);
        }

        if ($visits === null) {
            return 0;
        }

        $uniqueVisits = DB::query()
            ->fromSub($visits, 'analytics_visits')
            ->select(['identity', 'visit_day'])
            ->distinct();

        return DB::query()->fromSub($uniqueVisits, 'analytics_unique_visits')->count();
    }

    private function applyCurrency(Builder $query, string $currency, string $column = 'currency'): void
    {
        $query->where(function (Builder $currencyQuery) use ($currency, $column): void {
            $currencyQuery->where($column, $currency);
            if ($currency === Treatment::CURRENCY_UZS) {
                $currencyQuery->orWhereNull($column);
            }
        });
    }

    private function endExclusive(Carbon $end): string
    {
        return $end->copy()->addDay()->toDateString();
    }
}
