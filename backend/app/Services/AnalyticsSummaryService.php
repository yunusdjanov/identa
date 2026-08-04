<?php

namespace App\Services;

use App\Models\Treatment;
use App\Models\User;
use App\Support\AnalyticsCacheVersion;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

class AnalyticsSummaryService
{
    private const ALLOWED_RANGES = ['7d', '30d', '90d', '180d', '365d', 'ytd'];
    public function __construct(
        private readonly DentistAnalyticsQueryService $queries,
    ) {}

    /**
     * Builds the dentist analytics payload from tenant-scoped, date-bounded
     * queries. This replaces the previous browser-side "fetch every page then
     * aggregate" path without changing the UI's metric semantics.
     *
     * @param array{range: string, current_from: string, current_to: string, previous_from: string, previous_to: string, currency?: string} $filters
     * @return array<string, mixed>
     */
    public function summary(User $user, array $filters): array
    {
        $cacheKey = 'analytics:summary:'.hash('sha256', json_encode([
            'tenant' => $user->tenantDentistId(),
            'version' => AnalyticsCacheVersion::tenant((int) $user->tenantDentistId()),
            'filters' => $filters,
            'permissions' => [
                User::PERMISSION_PAYMENTS_VIEW => $user->hasPermission(User::PERMISSION_PAYMENTS_VIEW),
                User::PERMISSION_PATIENTS_VIEW => $user->hasPermission(User::PERMISSION_PATIENTS_VIEW),
                User::PERMISSION_APPOINTMENTS_VIEW => $user->hasPermission(User::PERMISSION_APPOINTMENTS_VIEW),
            ],
        ], JSON_THROW_ON_ERROR));

        return Cache::remember(
            $cacheKey,
            now()->addSeconds(45),
            fn (): array => $this->buildSummary($user, $filters)
        );
    }

    /**
     * @param array{range: string, current_from: string, current_to: string, previous_from: string, previous_to: string, currency?: string} $filters
     * @return array<string, mixed>
     */
    private function buildSummary(User $user, array $filters): array
    {
        $dentistId = $user->tenantDentistId();
        abort_unless($dentistId !== null, 403);

        $range = $this->range($filters['range']);
        $currentStart = Carbon::parse($filters['current_from'])->startOfDay();
        $currentEnd = Carbon::parse($filters['current_to'])->endOfDay();
        $previousStart = Carbon::parse($filters['previous_from'])->startOfDay();
        $previousEnd = Carbon::parse($filters['previous_to'])->endOfDay();
        $currency = $this->currency($filters['currency'] ?? null);

        $canViewPayments = $user->hasPermission(User::PERMISSION_PAYMENTS_VIEW);
        $canViewPatients = $user->hasPermission(User::PERMISSION_PATIENTS_VIEW);
        $canViewAppointments = $user->hasPermission(User::PERMISSION_APPOINTMENTS_VIEW);

        $buckets = $this->buckets($range, $currentStart, $currentEnd);

        return [
            'currency' => $currency,
            'permissions' => [
                'payments' => $canViewPayments,
                'patients' => $canViewPatients,
                'appointments' => $canViewAppointments,
            ],
            'kpis' => [
                'revenue' => $canViewPayments
                    ? $this->queries->revenueKpi($dentistId, $currency, $currentStart, $currentEnd, $previousStart, $previousEnd)
                    : ['current' => 0.0, 'previous' => 0.0],
                'debt' => [
                    'current' => $canViewPayments ? $this->queries->outstandingDebtTotal($dentistId, $currency) : 0.0,
                    'previous' => null,
                ],
                'patients' => $canViewPatients
                    ? $this->queries->patientKpi($dentistId, $currentStart, $currentEnd, $previousStart, $previousEnd)
                    : ['current' => 0, 'previous' => 0],
                'visits' => $this->queries->visitsKpi(
                    $dentistId,
                    $canViewAppointments,
                    $canViewPayments,
                    $currentStart,
                    $currentEnd,
                    $previousStart,
                    $previousEnd,
                ),
            ],
            'buckets' => $this->queries->bucketRows(
                $dentistId,
                $currency,
                $canViewPayments,
                $canViewPatients,
                $buckets,
                $currentStart,
                $currentEnd
            ),
            'appointment_status' => $this->queries->appointmentStatus(
                $dentistId,
                $canViewAppointments,
                $currentStart,
                $currentEnd,
            ),
            'top_debtors' => $this->queries->topDebtors(
                $dentistId,
                $currency,
                $canViewPayments,
                $currentStart,
                $currentEnd,
            ),
        ];
    }

    /**
     * @return string
     */
    private function range(string $range): string
    {
        return in_array($range, self::ALLOWED_RANGES, true) ? $range : '30d';
    }

    private function currency(?string $currency): string
    {
        return in_array($currency, Treatment::SUPPORTED_CURRENCIES, true)
            ? $currency
            : Treatment::CURRENCY_UZS;
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

}
