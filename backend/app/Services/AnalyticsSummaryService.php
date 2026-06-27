<?php

namespace App\Services;

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AnalyticsSummaryService
{
    private const ALLOWED_RANGES = ['7d', '30d', '90d', '180d', '365d', 'ytd'];

    /**
     * Builds the dentist analytics payload from tenant-scoped, date-bounded
     * queries. This replaces the previous browser-side "fetch every page then
     * aggregate" path without changing the UI's metric semantics.
     *
     * @param array{range: string, current_from: string, current_to: string, previous_from: string, previous_to: string} $filters
     * @return array<string, mixed>
     */
    public function summary(User $user, array $filters): array
    {
        $dentistId = $user->tenantDentistId();
        abort_unless($dentistId !== null, 403);

        $range = $this->range($filters['range']);
        $currentStart = Carbon::parse($filters['current_from'])->startOfDay();
        $currentEnd = Carbon::parse($filters['current_to'])->endOfDay();
        $previousStart = Carbon::parse($filters['previous_from'])->startOfDay();
        $previousEnd = Carbon::parse($filters['previous_to'])->endOfDay();
        $queryStart = $previousStart->copy()->min($currentStart)->toDateString();
        $queryEnd = $currentEnd->copy()->max($previousEnd)->toDateString();

        $canViewPayments = $user->hasPermission(User::PERMISSION_PAYMENTS_VIEW);
        $canViewPatients = $user->hasPermission(User::PERMISSION_PATIENTS_VIEW);
        $canViewAppointments = $user->hasPermission(User::PERMISSION_APPOINTMENTS_VIEW);

        $treatments = $canViewPayments
            ? $this->treatments($dentistId, $queryStart, $queryEnd)
            : collect();
        $patients = $canViewPatients
            ? $this->patients($dentistId, $queryStart, $queryEnd)
            : collect();
        $appointments = $canViewAppointments
            ? $this->appointments($dentistId, $queryStart, $queryEnd)
            : collect();

        $buckets = $this->buckets($range, $currentStart, $currentEnd);

        return [
            'permissions' => [
                'payments' => $canViewPayments,
                'patients' => $canViewPatients,
                'appointments' => $canViewAppointments,
            ],
            'kpis' => [
                'revenue' => $this->revenueKpi($treatments, $currentStart, $currentEnd, $previousStart, $previousEnd),
                'debt' => [
                    'current' => $canViewPayments ? $this->outstandingDebtTotal($dentistId) : 0.0,
                    'previous' => null,
                ],
                'patients' => $this->patientKpi($patients, $currentStart, $currentEnd, $previousStart, $previousEnd),
                'visits' => $this->visitsKpi($appointments, $treatments, $currentStart, $currentEnd, $previousStart, $previousEnd),
            ],
            'buckets' => $this->bucketRows($buckets, $treatments, $patients),
            'appointment_status' => $this->appointmentStatus($appointments, $currentStart, $currentEnd),
            'top_debtors' => $this->topDebtors($treatments, $currentStart, $currentEnd),
        ];
    }

    /**
     * @return string
     */
    private function range(string $range): string
    {
        return in_array($range, self::ALLOWED_RANGES, true) ? $range : '30d';
    }

    private function treatments(int $dentistId, string $dateFrom, string $dateTo)
    {
        return Treatment::query()
            ->leftJoin('patients', function ($join): void {
                $join->on('patients.id', '=', 'treatments.patient_id')
                    ->on('patients.dentist_id', '=', 'treatments.dentist_id');
            })
            ->where('treatments.dentist_id', $dentistId)
            ->whereDate('treatments.treatment_date', '>=', $dateFrom)
            ->whereDate('treatments.treatment_date', '<=', $dateTo)
            ->get([
                'treatments.patient_id',
                'treatments.treatment_date',
                'treatments.debt_amount',
                'treatments.paid_amount',
                'patients.full_name as patient_name',
                'patients.phone as patient_phone',
            ]);
    }

    private function patients(int $dentistId, string $dateFrom, string $dateTo)
    {
        return Patient::query()
            ->where('dentist_id', $dentistId)
            ->whereBetween(DB::raw('DATE(created_at)'), [$dateFrom, $dateTo])
            ->get(['id', 'created_at']);
    }

    private function appointments(int $dentistId, string $dateFrom, string $dateTo)
    {
        return Appointment::query()
            ->where('dentist_id', $dentistId)
            ->whereDate('appointment_date', '>=', $dateFrom)
            ->whereDate('appointment_date', '<=', $dateTo)
            ->get(['id', 'patient_id', 'appointment_date', 'status']);
    }

    private function revenueKpi($treatments, Carbon $currentStart, Carbon $currentEnd, Carbon $previousStart, Carbon $previousEnd): array
    {
        $current = 0.0;
        $previous = 0.0;

        foreach ($treatments as $treatment) {
            $paid = (float) $treatment->paid_amount;
            if ($paid === 0.0) {
                continue;
            }

            if ($this->dateBetween((string) $treatment->treatment_date, $currentStart, $currentEnd)) {
                $current += $paid;
            } elseif ($this->dateBetween((string) $treatment->treatment_date, $previousStart, $previousEnd)) {
                $previous += $paid;
            }
        }

        return ['current' => $current, 'previous' => $previous];
    }

    private function patientKpi($patients, Carbon $currentStart, Carbon $currentEnd, Carbon $previousStart, Carbon $previousEnd): array
    {
        $current = 0;
        $previous = 0;

        foreach ($patients as $patient) {
            $createdAt = $patient->created_at?->toDateString();
            if ($this->dateBetween($createdAt, $currentStart, $currentEnd)) {
                $current += 1;
            } elseif ($this->dateBetween($createdAt, $previousStart, $previousEnd)) {
                $previous += 1;
            }
        }

        return ['current' => $current, 'previous' => $previous];
    }

    private function visitsKpi($appointments, $treatments, Carbon $currentStart, Carbon $currentEnd, Carbon $previousStart, Carbon $previousEnd): array
    {
        return [
            'current' => $this->visitCount($appointments, $treatments, $currentStart, $currentEnd),
            'previous' => $this->visitCount($appointments, $treatments, $previousStart, $previousEnd),
        ];
    }

    private function visitCount($appointments, $treatments, Carbon $start, Carbon $end): int
    {
        $keys = [];

        foreach ($appointments as $appointment) {
            if ($appointment->status !== Appointment::STATUS_COMPLETED) {
                continue;
            }
            $day = $this->dateKey((string) $appointment->appointment_date);
            if ($day === null || ! $this->dateBetween($day, $start, $end)) {
                continue;
            }
            $identity = $appointment->patient_id
                ? 'patient:'.$appointment->patient_id
                : 'guest-appointment:'.$appointment->id;
            $keys[$identity.':'.$day] = true;
        }

        foreach ($treatments as $treatment) {
            if (! $treatment->patient_id) {
                continue;
            }
            $day = $this->dateKey((string) $treatment->treatment_date);
            if ($day === null || ! $this->dateBetween($day, $start, $end)) {
                continue;
            }
            $keys['patient:'.$treatment->patient_id.':'.$day] = true;
        }

        return count($keys);
    }

    private function outstandingDebtTotal(int $dentistId): float
    {
        $patientBalances = Treatment::query()
            ->where('dentist_id', $dentistId)
            ->selectRaw('patient_id, COALESCE(SUM(debt_amount), 0) AS total_debt, COALESCE(SUM(paid_amount), 0) AS total_paid')
            ->groupBy('patient_id');

        return (float) DB::query()
            ->fromSub($patientBalances->toBase(), 'analytics_patient_balances')
            ->selectRaw('COALESCE(SUM(CASE WHEN total_debt - total_paid > 0 THEN total_debt - total_paid ELSE 0 END), 0) AS total')
            ->value('total');
    }

    private function bucketRows(array $buckets, $treatments, $patients): array
    {
        $rows = [];

        foreach ($buckets as $bucket) {
            $rows[$bucket['key']] = [
                'key' => $bucket['key'],
                'revenue' => 0.0,
                'debt' => 0.0,
                'new_patients' => 0,
                'cumulative_patients' => 0,
            ];
        }

        foreach ($treatments as $treatment) {
            $key = $this->bucketKey((string) $treatment->treatment_date, $buckets);
            if ($key === null || ! isset($rows[$key])) {
                continue;
            }
            $rows[$key]['revenue'] += (float) $treatment->paid_amount;
            $rows[$key]['debt'] += $this->outstandingBalance($treatment);
        }

        $cumulative = 0;
        foreach ($buckets as $bucket) {
            $newPatients = 0;
            foreach ($patients as $patient) {
                $createdAt = $patient->created_at?->toDateString();
                if ($createdAt !== null && $this->dateBetween($createdAt, $bucket['start'], $bucket['end'])) {
                    $newPatients += 1;
                }
            }
            $cumulative += $newPatients;
            $rows[$bucket['key']]['new_patients'] = $newPatients;
            $rows[$bucket['key']]['cumulative_patients'] = $cumulative;
        }

        return array_values($rows);
    }

    private function appointmentStatus($appointments, Carbon $currentStart, Carbon $currentEnd): array
    {
        $counts = [
            Appointment::STATUS_SCHEDULED => 0,
            Appointment::STATUS_COMPLETED => 0,
            Appointment::STATUS_CANCELLED => 0,
            Appointment::STATUS_NO_SHOW => 0,
        ];

        foreach ($appointments as $appointment) {
            if (! $this->dateBetween((string) $appointment->appointment_date, $currentStart, $currentEnd)) {
                continue;
            }
            if (array_key_exists($appointment->status, $counts)) {
                $counts[$appointment->status] += 1;
            }
        }

        return collect($counts)
            ->map(fn (int $count, string $status): array => ['status' => $status, 'count' => $count])
            ->values()
            ->all();
    }

    private function topDebtors($treatments, Carbon $currentStart, Carbon $currentEnd): array
    {
        $grouped = [];

        foreach ($treatments as $treatment) {
            if (! $this->dateBetween((string) $treatment->treatment_date, $currentStart, $currentEnd)) {
                continue;
            }
            $debt = $this->outstandingBalance($treatment);
            if ($debt <= 0) {
                continue;
            }
            $patientId = (string) ($treatment->patient_id ?? 'unknown');
            $grouped[$patientId] ??= [
                'name' => (string) ($treatment->patient_name ?? '-'),
                'phone' => (string) ($treatment->patient_phone ?? ''),
                'debt' => 0.0,
            ];
            $grouped[$patientId]['debt'] += $debt;
        }

        usort($grouped, fn (array $a, array $b): int => $b['debt'] <=> $a['debt']);

        return array_slice($grouped, 0, 5);
    }

    private function outstandingBalance(object $treatment): float
    {
        return max(0.0, (float) $treatment->debt_amount - (float) $treatment->paid_amount);
    }

    /**
     * @return list<array{key: string, start: Carbon, end: Carbon}>
     */
    private function buckets(string $range, Carbon $start, Carbon $end): array
    {
        if ($range === '7d' || $range === '30d') {
            return $this->dailyBuckets($start, $end);
        }

        if ($range === '90d') {
            return $this->weeklyBuckets($start, $end);
        }

        return $this->monthlyBuckets($start, $end);
    }

    private function dailyBuckets(Carbon $start, Carbon $end): array
    {
        $buckets = [];
        $cursor = $start->copy()->startOfDay();
        while ($cursor <= $end) {
            $buckets[] = [
                'key' => $cursor->toDateString(),
                'start' => $cursor->copy()->startOfDay(),
                'end' => $cursor->copy()->endOfDay(),
            ];
            $cursor->addDay();
        }

        return $buckets;
    }

    private function weeklyBuckets(Carbon $start, Carbon $end): array
    {
        $buckets = [];
        $cursor = $start->copy()->startOfDay();
        $seen = [];
        while ($cursor <= $end) {
            $weekStart = $cursor->copy()->startOfWeek();
            $key = $weekStart->isoFormat('GGGG-[W]WW');
            if (! isset($seen[$key])) {
                $seen[$key] = true;
                $buckets[] = [
                    'key' => $key,
                    'start' => $weekStart,
                    'end' => $weekStart->copy()->endOfWeek(),
                ];
            }
            $cursor->addWeek();
        }

        return $buckets;
    }

    private function monthlyBuckets(Carbon $start, Carbon $end): array
    {
        $buckets = [];
        $cursor = $start->copy()->startOfMonth();
        while ($cursor <= $end) {
            $buckets[] = [
                'key' => $cursor->format('Y-m'),
                'start' => $cursor->copy()->startOfMonth(),
                'end' => $cursor->copy()->endOfMonth(),
            ];
            $cursor->addMonth();
        }

        return $buckets;
    }

    private function bucketKey(string $value, array $buckets): ?string
    {
        foreach ($buckets as $bucket) {
            if ($this->dateBetween($value, $bucket['start'], $bucket['end'])) {
                return $bucket['key'];
            }
        }

        return null;
    }

    private function dateKey(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return Carbon::parse($value)->toDateString();
    }

    private function dateBetween(?string $value, Carbon $start, Carbon $end): bool
    {
        $day = $this->dateKey($value);
        if ($day === null) {
            return false;
        }

        $date = Carbon::parse($day)->startOfDay();

        return $date >= $start->copy()->startOfDay() && $date <= $end->copy()->endOfDay();
    }
}
