<?php

namespace App\Services;

use App\Support\AnalyticsCacheVersion;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

class AdminAnalyticsSummaryService
{
    public function __construct(
        private readonly AdminAnalyticsQueryService $queries,
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

        return $this->queries->summarize(
            $this->buckets($range, $currentStart, $currentEnd),
            $currentStart,
            $currentEnd,
            $previousStart,
            $previousEnd,
        );
    }

    private function range(string $range): string
    {
        return in_array($range, ['7d', '30d', '90d', '180d', '365d', 'ytd'], true) ? $range : '30d';
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

}
