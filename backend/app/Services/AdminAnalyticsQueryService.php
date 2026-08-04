<?php

namespace App\Services;

use App\Models\Plan;
use App\Models\User;
use Illuminate\Support\Carbon;

class AdminAnalyticsQueryService
{
    private const BILLABLE_STATUSES = ['active', 'grace', 'read_only'];

    private const DENTIST_BATCH_SIZE = 200;

    public function __construct(
        private readonly SubscriptionService $subscriptions,
    ) {}

    /**
     * Build the complete admin analytics projection while keeping only one
     * bounded Eloquent chunk in memory. The old implementation hydrated every
     * dentist and then traversed that collection several times.
     *
     * @param  list<array{key: string, start: Carbon, end: Carbon}>  $buckets
     * @return array<string, mixed>
     */
    public function summarize(
        array $buckets,
        Carbon $currentStart,
        Carbon $currentEnd,
        Carbon $previousStart,
        Carbon $previousEnd,
    ): array {
        $plansByCode = Plan::query()
            ->select(['code', 'currency', 'monthly_price', 'yearly_price'])
            ->get()
            ->keyBy('code');

        [$growthRows, $bucketByDate, $activeByBucket] = $this->prepareGrowthBuckets(
            $buckets,
            $currentStart,
            $currentEnd,
        );

        $activeCurrent = 0;
        $activePrevious = 0;
        $signups = ['current' => 0, 'previous' => 0];
        $conversion = [
            'current' => ['paid' => 0, 'finished_trial' => 0],
            'previous' => ['paid' => 0, 'finished_trial' => 0],
        ];
        $health = [
            'active' => 0,
            'trialing' => 0,
            'grace' => 0,
            'read_only' => 0,
            'canceled' => 0,
            'none' => 0,
        ];
        $mrrByCurrency = [];
        $activeBeforeRange = 0;
        $now = Carbon::now();

        User::query()
            ->select(['id', 'role', 'created_at', 'account_status'])
            ->where('role', User::ROLE_DENTIST)
            ->where('account_status', '!=', User::ACCOUNT_STATUS_DELETED)
            ->with('latestSubscription')
            ->lazyById(self::DENTIST_BATCH_SIZE)
            ->each(function (User $dentist) use (
                $plansByCode,
                $currentStart,
                $currentEnd,
                $previousStart,
                $previousEnd,
                $bucketByDate,
                &$growthRows,
                &$activeByBucket,
                &$activeBeforeRange,
                &$activeCurrent,
                &$activePrevious,
                &$signups,
                &$conversion,
                &$health,
                &$mrrByCurrency,
                $now,
            ): void {
                $createdDate = $dentist->created_at?->toDateString();
                $summary = $this->subscriptions->analyticsSnapshot($dentist);
                $status = (string) ($summary['status'] ?? 'none');
                $health[array_key_exists($status, $health) ? $status : 'none'] += 1;

                if ($dentist->account_status === User::ACCOUNT_STATUS_ACTIVE) {
                    $activeCurrent += 1;
                    if ($dentist->created_at !== null && $dentist->created_at <= $previousEnd) {
                        $activePrevious += 1;
                    }
                }

                if ($this->dateBetween($createdDate, $currentStart, $currentEnd)) {
                    $signups['current'] += 1;
                    $this->accumulateConversion($conversion['current'], $summary, $now);
                } elseif ($this->dateBetween($createdDate, $previousStart, $previousEnd)) {
                    $signups['previous'] += 1;
                    $this->accumulateConversion($conversion['previous'], $summary, $now);
                }

                $this->accumulateMrr($mrrByCurrency, $plansByCode, $summary);

                if ($createdDate === null) {
                    return;
                }

                $bucketKey = $bucketByDate[$createdDate] ?? null;
                if ($bucketKey !== null) {
                    $growthRows[$bucketKey]['signups'] += 1;
                }

                if ($dentist->account_status !== User::ACCOUNT_STATUS_ACTIVE
                    || $createdDate > $currentEnd->toDateString()) {
                    return;
                }

                if ($createdDate < $currentStart->toDateString()) {
                    $activeBeforeRange += 1;
                } elseif ($bucketKey !== null) {
                    $activeByBucket[$bucketKey] += 1;
                }
            });

        $cumulative = $activeBeforeRange;
        foreach ($buckets as $bucket) {
            $cumulative += $activeByBucket[$bucket['key']];
            $growthRows[$bucket['key']]['cumulative'] = $cumulative;
        }

        $mrr = $this->formatMrr($mrrByCurrency);

        return [
            'kpis' => [
                'active_dentists' => ['current' => $activeCurrent, 'previous' => $activePrevious],
                'mrr' => [
                    'current' => $mrr['amount'],
                    // Subscription state is not versioned, so historical MRR
                    // cannot be reconstructed without a billing snapshot table.
                    'previous' => null,
                    'currency' => $mrr['currency'],
                    'totals_by_currency' => $mrr['totals_by_currency'],
                ],
                'signups' => $signups,
                'conversion' => [
                    'current' => $this->conversionRate($conversion['current']),
                    'previous' => $this->conversionRate($conversion['previous']),
                ],
            ],
            'signup_growth' => array_values($growthRows),
            'subscription_health' => collect($health)
                ->map(fn (int $count, string $healthStatus): array => [
                    'status' => $healthStatus,
                    'count' => $count,
                ])
                ->values()
                ->all(),
        ];
    }

    /**
     * @param  list<array{key: string, start: Carbon, end: Carbon}>  $buckets
     * @return array{0: array<string, array{key: string, signups: int, cumulative: int}>, 1: array<string, string>, 2: array<string, int>}
     */
    private function prepareGrowthBuckets(array $buckets, Carbon $rangeStart, Carbon $rangeEnd): array
    {
        $rows = [];
        $bucketByDate = [];
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

        return [$rows, $bucketByDate, $activeByBucket];
    }

    /**
     * @param  array{paid: int, finished_trial: int}  $counts
     * @param  array{status: string, plan: ?string, billing_period: ?string, trial_ends_at: ?string}  $summary
     */
    private function accumulateConversion(array &$counts, array $summary, Carbon $now): void
    {
        if (in_array($summary['status'], self::BILLABLE_STATUSES, true) && ($summary['plan'] ?? null) !== 'trial') {
            $counts['paid'] += 1;

            return;
        }

        if (($summary['plan'] ?? null) === 'trial'
            && ($summary['trial_ends_at'] ?? null) !== null
            && Carbon::parse((string) $summary['trial_ends_at']) < $now) {
            $counts['finished_trial'] += 1;
        }
    }

    /**
     * @param  array<string, float>  $amountsByCurrency
     * @param  \Illuminate\Support\Collection<string, Plan>  $plansByCode
     * @param  array{status: string, plan: ?string, billing_period: ?string, trial_ends_at: ?string}  $summary
     */
    private function accumulateMrr(array &$amountsByCurrency, $plansByCode, array $summary): void
    {
        if (! in_array($summary['status'], self::BILLABLE_STATUSES, true)) {
            return;
        }

        $planCode = $summary['plan'] ?? null;
        if ($planCode === null || $planCode === 'trial') {
            return;
        }

        $plan = $plansByCode->get($planCode);
        if (! $plan instanceof Plan) {
            return;
        }

        $currency = (string) ($plan->currency ?? 'UZS');
        $amountsByCurrency[$currency] = ($amountsByCurrency[$currency] ?? 0.0)
            + (($summary['billing_period'] ?? null) === 'yearly'
                ? ((float) $plan->yearly_price) / 12
                : (float) $plan->monthly_price);
    }

    /**
     * @param  array<string, float>  $amountsByCurrency
     * @return array{amount: float|int, currency: string, totals_by_currency: list<array{currency: string, current: float|int}>}
     */
    private function formatMrr(array $amountsByCurrency): array
    {
        $totalsByCurrency = collect($amountsByCurrency)
            ->map(fn (float $amount, string $currency): array => [
                'currency' => $currency,
                'current' => round($amount),
            ])
            ->sortByDesc('current')
            ->values()
            ->all();
        $primary = $totalsByCurrency[0] ?? ['currency' => 'UZS', 'current' => 0];

        return [
            'amount' => $primary['current'],
            'currency' => $primary['currency'],
            'totals_by_currency' => $totalsByCurrency,
        ];
    }

    /**
     * @param  array{paid: int, finished_trial: int}  $counts
     */
    private function conversionRate(array $counts): float
    {
        $denominator = $counts['paid'] + $counts['finished_trial'];

        return $denominator > 0 ? ($counts['paid'] / $denominator) * 100 : 0.0;
    }

    private function dateBetween(?string $value, Carbon $start, Carbon $end): bool
    {
        return $value !== null
            && $value !== ''
            && $value >= $start->toDateString()
            && $value <= $end->toDateString();
    }
}
