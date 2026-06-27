<?php

namespace App\Services;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Support\Carbon;

class AdminAnalyticsSummaryService
{
    private const BILLABLE_STATUSES = ['active', 'grace', 'read_only'];

    /**
     * @param array{range: string, current_from: string, current_to: string, previous_from: string, previous_to: string} $filters
     * @return array<string, mixed>
     */
    public function summary(array $filters): array
    {
        $range = $this->range($filters['range']);
        $currentStart = Carbon::parse($filters['current_from'])->startOfDay();
        $currentEnd = Carbon::parse($filters['current_to'])->endOfDay();
        $previousStart = Carbon::parse($filters['previous_from'])->startOfDay();
        $previousEnd = Carbon::parse($filters['previous_to'])->endOfDay();

        $dentists = User::query()
            ->where('role', User::ROLE_DENTIST)
            ->where('account_status', '!=', User::ACCOUNT_STATUS_DELETED)
            ->with(['subscriptions.plan'])
            ->get();
        $plans = Plan::query()->get();
        $mrr = $this->mrr($dentists, $plans);
        $activeKpi = $this->activeKpi($dentists, $previousEnd);

        return [
            'kpis' => [
                'active_dentists' => $activeKpi,
                'mrr' => [
                    'current' => $mrr['amount'],
                    'previous' => $activeKpi['current'] > 0
                        ? round($mrr['amount'] * ($activeKpi['previous'] / $activeKpi['current']))
                        : $mrr['amount'],
                    'currency' => $mrr['currency'],
                ],
                'signups' => $this->signupsKpi($dentists, $currentStart, $currentEnd, $previousStart, $previousEnd),
                'conversion' => $this->conversionKpi($dentists, $currentStart, $currentEnd, $previousStart, $previousEnd),
            ],
            'signup_growth' => $this->signupGrowth($dentists, $this->buckets($range, $currentStart, $currentEnd), $currentEnd),
            'subscription_health' => $this->subscriptionHealth($dentists),
        ];
    }

    private function range(string $range): string
    {
        return in_array($range, ['7d', '30d', '90d', '180d', '365d', 'ytd'], true) ? $range : '30d';
    }

    private function activeKpi($dentists, Carbon $previousEnd): array
    {
        $current = 0;
        $previous = 0;

        foreach ($dentists as $dentist) {
            if ($dentist->account_status !== User::ACCOUNT_STATUS_ACTIVE) {
                continue;
            }
            $current += 1;
            if ($dentist->created_at !== null && $dentist->created_at <= $previousEnd) {
                $previous += 1;
            }
        }

        return ['current' => $current, 'previous' => $previous];
    }

    private function signupsKpi($dentists, Carbon $currentStart, Carbon $currentEnd, Carbon $previousStart, Carbon $previousEnd): array
    {
        $current = 0;
        $previous = 0;

        foreach ($dentists as $dentist) {
            if ($this->dateBetween($dentist->created_at?->toDateString(), $currentStart, $currentEnd)) {
                $current += 1;
            } elseif ($this->dateBetween($dentist->created_at?->toDateString(), $previousStart, $previousEnd)) {
                $previous += 1;
            }
        }

        return ['current' => $current, 'previous' => $previous];
    }

    private function conversionKpi($dentists, Carbon $currentStart, Carbon $currentEnd, Carbon $previousStart, Carbon $previousEnd): array
    {
        return [
            'current' => $this->conversionRate($dentists, $currentStart, $currentEnd),
            'previous' => $this->conversionRate($dentists, $previousStart, $previousEnd),
        ];
    }

    private function conversionRate($dentists, Carbon $start, Carbon $end): float
    {
        $paid = 0;
        $finishedTrials = 0;
        $now = Carbon::now();

        foreach ($dentists as $dentist) {
            if (! $this->dateBetween($dentist->created_at?->toDateString(), $start, $end)) {
                continue;
            }
            $summary = $dentist->subscriptionSummary();
            if (in_array($summary['status'], self::BILLABLE_STATUSES, true) && ($summary['plan'] ?? null) !== 'trial') {
                $paid += 1;
            } elseif (($summary['plan'] ?? null) === 'trial'
                && ($summary['trial_ends_at'] ?? null) !== null
                && Carbon::parse((string) $summary['trial_ends_at']) < $now) {
                $finishedTrials += 1;
            }
        }

        $denominator = $paid + $finishedTrials;

        return $denominator > 0 ? ($paid / $denominator) * 100 : 0.0;
    }

    private function mrr($dentists, $plans): array
    {
        $plansByCode = $plans->keyBy('code');
        $amount = 0.0;
        $currency = 'UZS';
        $pickedCurrency = false;

        foreach ($dentists as $dentist) {
            $summary = $dentist->subscriptionSummary();
            if (! in_array($summary['status'], self::BILLABLE_STATUSES, true)) {
                continue;
            }
            $planCode = $summary['plan'] ?? null;
            if ($planCode === null || $planCode === 'trial') {
                continue;
            }
            $plan = $plansByCode->get($planCode);
            if ($plan === null) {
                continue;
            }
            if (! $pickedCurrency) {
                $currency = $plan->currency ?? 'UZS';
                $pickedCurrency = true;
            }
            $amount += ($summary['billing_period'] ?? null) === 'yearly'
                ? ((float) $plan->yearly_price) / 12
                : (float) $plan->monthly_price;
        }

        return [
            'amount' => round($amount),
            'currency' => $currency,
        ];
    }

    private function signupGrowth($dentists, array $buckets, Carbon $rangeEnd): array
    {
        $rows = [];

        foreach ($buckets as $index => $bucket) {
            $signups = 0;
            $cumulative = 0;
            $cutoff = $index === count($buckets) - 1 ? $rangeEnd : $bucket['end'];

            foreach ($dentists as $dentist) {
                $createdAt = $dentist->created_at?->toDateString();
                if ($this->dateBetween($createdAt, $bucket['start'], $bucket['end'])) {
                    $signups += 1;
                }
                if ($dentist->account_status === User::ACCOUNT_STATUS_ACTIVE
                    && $this->dateBetween($createdAt, Carbon::create(1970, 1, 1)->startOfDay(), $cutoff)) {
                    $cumulative += 1;
                }
            }

            $rows[] = [
                'key' => $bucket['key'],
                'signups' => $signups,
                'cumulative' => $cumulative,
            ];
        }

        return $rows;
    }

    private function subscriptionHealth($dentists): array
    {
        $counts = [
            'active' => 0,
            'trialing' => 0,
            'grace' => 0,
            'read_only' => 0,
            'canceled' => 0,
            'none' => 0,
        ];

        foreach ($dentists as $dentist) {
            $status = (string) ($dentist->subscriptionSummary()['status'] ?? 'none');
            $counts[array_key_exists($status, $counts) ? $status : 'none'] += 1;
        }

        return collect($counts)
            ->map(fn (int $count, string $status): array => ['status' => $status, 'count' => $count])
            ->values()
            ->all();
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
            $buckets[] = ['key' => $cursor->toDateString(), 'start' => $cursor->copy(), 'end' => $cursor->copy()->endOfDay()];
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
                $buckets[] = ['key' => $key, 'start' => $weekStart, 'end' => $weekStart->copy()->endOfWeek()];
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
            $buckets[] = ['key' => $cursor->format('Y-m'), 'start' => $cursor->copy(), 'end' => $cursor->copy()->endOfMonth()];
            $cursor->addMonth();
        }

        return $buckets;
    }

    private function dateBetween(?string $value, Carbon $start, Carbon $end): bool
    {
        if ($value === null || $value === '') {
            return false;
        }
        $date = Carbon::parse($value)->startOfDay();

        return $date >= $start->copy()->startOfDay() && $date <= $end->copy()->endOfDay();
    }
}
