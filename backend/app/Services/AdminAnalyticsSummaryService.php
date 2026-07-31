<?php

namespace App\Services;

use App\Models\Plan;
use App\Models\User;
use App\Support\AnalyticsCacheVersion;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

class AdminAnalyticsSummaryService
{
    private const BILLABLE_STATUSES = ['active', 'grace', 'read_only'];

    public function __construct(
        private readonly SubscriptionService $subscriptions,
    ) {}

    /**
     * @param array{range: string, current_from: string, current_to: string, previous_from: string, previous_to: string} $filters
     * @return array<string, mixed>
     */
    public function summary(array $filters): array
    {
        $cacheKey = 'admin:analytics:summary:'.hash(
            'sha256',
            json_encode([
                'version' => AnalyticsCacheVersion::admin(),
                'filters' => $filters,
            ], JSON_THROW_ON_ERROR)
        );

        return Cache::remember(
            $cacheKey,
            now()->addSeconds(60),
            fn (): array => $this->buildSummary($filters)
        );
    }

    /**
     * @param array{range: string, current_from: string, current_to: string, previous_from: string, previous_to: string} $filters
     * @return array<string, mixed>
     */
    private function buildSummary(array $filters): array
    {
        $range = $this->range($filters['range']);
        $currentStart = Carbon::parse($filters['current_from'])->startOfDay();
        $currentEnd = Carbon::parse($filters['current_to'])->endOfDay();
        $previousStart = Carbon::parse($filters['previous_from'])->startOfDay();
        $previousEnd = Carbon::parse($filters['previous_to'])->endOfDay();

        $dentists = User::query()
            ->select(['id', 'created_at', 'account_status'])
            ->where('role', User::ROLE_DENTIST)
            ->where('account_status', '!=', User::ACCOUNT_STATUS_DELETED)
            ->with([
                'latestSubscription' => static function (HasOne $subscription): void {
                    $subscription->select([
                        'subscriptions.id as id',
                        'subscriptions.user_id as user_id',
                        'subscriptions.plan_code as plan_code',
                        'subscriptions.billing_period as billing_period',
                        'subscriptions.status as status',
                        'subscriptions.starts_at as starts_at',
                        'subscriptions.ends_at as ends_at',
                    ]);
                },
            ])
            ->get();
        $plans = Plan::query()->get();
        $subscriptionSummaries = $dentists->mapWithKeys(
            fn (User $dentist): array => [
                (int) $dentist->id => $this->subscriptions->analyticsSnapshot($dentist),
            ]
        );
        $mrr = $this->mrr($dentists, $plans, $subscriptionSummaries);
        $activeKpi = $this->activeKpi($dentists, $previousEnd);

        return [
            'kpis' => [
                'active_dentists' => $activeKpi,
                'mrr' => [
                    'current' => $mrr['amount'],
                    // Subscription state is not versioned, so historical MRR
                    // cannot be reconstructed honestly. Do not estimate it
                    // from the dentist-count ratio.
                    'previous' => null,
                    'currency' => $mrr['currency'],
                    'totals_by_currency' => $mrr['totals_by_currency'],
                ],
                'signups' => $this->signupsKpi($dentists, $currentStart, $currentEnd, $previousStart, $previousEnd),
                'conversion' => $this->conversionKpi(
                    $dentists,
                    $subscriptionSummaries,
                    $currentStart,
                    $currentEnd,
                    $previousStart,
                    $previousEnd
                ),
            ],
            'signup_growth' => $this->signupGrowth(
                $dentists,
                $this->buckets($range, $currentStart, $currentEnd),
                $currentStart,
                $currentEnd
            ),
            'subscription_health' => $this->subscriptionHealth($dentists, $subscriptionSummaries),
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

    private function conversionKpi(
        $dentists,
        $subscriptionSummaries,
        Carbon $currentStart,
        Carbon $currentEnd,
        Carbon $previousStart,
        Carbon $previousEnd
    ): array
    {
        return [
            'current' => $this->conversionRate($dentists, $subscriptionSummaries, $currentStart, $currentEnd),
            'previous' => $this->conversionRate($dentists, $subscriptionSummaries, $previousStart, $previousEnd),
        ];
    }

    private function conversionRate($dentists, $subscriptionSummaries, Carbon $start, Carbon $end): float
    {
        $paid = 0;
        $finishedTrials = 0;
        $now = Carbon::now();

        foreach ($dentists as $dentist) {
            if (! $this->dateBetween($dentist->created_at?->toDateString(), $start, $end)) {
                continue;
            }
            $summary = $subscriptionSummaries->get((int) $dentist->id, []);
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

    private function mrr($dentists, $plans, $subscriptionSummaries): array
    {
        $plansByCode = $plans->keyBy('code');
        $amountsByCurrency = [];

        foreach ($dentists as $dentist) {
            $summary = $subscriptionSummaries->get((int) $dentist->id, []);
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
            $currency = (string) ($plan->currency ?? 'UZS');
            $amountsByCurrency[$currency] = ($amountsByCurrency[$currency] ?? 0.0)
                + (($summary['billing_period'] ?? null) === 'yearly'
                    ? ((float) $plan->yearly_price) / 12
                    : (float) $plan->monthly_price);
        }

        $totalsByCurrency = collect($amountsByCurrency)
            ->map(fn (float $amount, string $currency): array => [
                'currency' => $currency,
                'current' => round($amount),
            ])
            ->sortByDesc('current')
            ->values()
            ->all();
        $primary = $totalsByCurrency[0] ?? [
            'currency' => 'UZS',
            'current' => 0,
        ];

        return [
            'amount' => $primary['current'],
            'currency' => $primary['currency'],
            'totals_by_currency' => $totalsByCurrency,
        ];
    }

    private function signupGrowth(
        $dentists,
        array $buckets,
        Carbon $rangeStart,
        Carbon $rangeEnd
    ): array
    {
        $rows = [];
        $bucketByDate = [];
        $activeBeforeRange = 0;
        $activeByBucket = [];

        foreach ($buckets as $bucket) {
            $rows[$bucket['key']] = [
                'key' => $bucket['key'],
                'signups' => 0,
                'cumulative' => 0,
            ];
            $activeByBucket[$bucket['key']] = 0;

            $cursor = $bucket['start']->copy()->max($rangeStart)->copy()->startOfDay();
            $end = $bucket['end']->copy()->min($rangeEnd)->copy()->endOfDay();
            while ($cursor <= $end) {
                $bucketByDate[$cursor->toDateString()] = $bucket['key'];
                $cursor->addDay();
            }
        }

        foreach ($dentists as $dentist) {
            $createdAt = $dentist->created_at?->toDateString();
            if ($createdAt === null) {
                continue;
            }

            $key = $bucketByDate[$createdAt] ?? null;
            if ($key !== null) {
                $rows[$key]['signups'] += 1;
            }

            if ($dentist->account_status !== User::ACCOUNT_STATUS_ACTIVE
                || $createdAt > $rangeEnd->toDateString()) {
                continue;
            }

            if ($createdAt < $rangeStart->toDateString()) {
                $activeBeforeRange += 1;
            } elseif ($key !== null) {
                $activeByBucket[$key] += 1;
            }
        }

        $cumulative = $activeBeforeRange;
        foreach ($buckets as $bucket) {
            $cumulative += $activeByBucket[$bucket['key']];
            $rows[$bucket['key']]['cumulative'] = $cumulative;
        }

        return array_values($rows);
    }

    private function subscriptionHealth($dentists, $subscriptionSummaries): array
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
            $status = (string) (($subscriptionSummaries->get((int) $dentist->id, []))['status'] ?? 'none');
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
        return $value >= $start->toDateString() && $value <= $end->toDateString();
    }
}
