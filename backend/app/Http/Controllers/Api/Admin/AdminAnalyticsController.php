<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\AdminAnalyticsSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminAnalyticsController extends Controller
{
    /**
     * Maximum inclusive days accepted for each supported presentation range.
     *
     * @var array<string, int>
     */
    private const MAX_RANGE_DAYS = [
        '7d' => 7,
        '30d' => 30,
        '90d' => 90,
        '180d' => 180,
        '365d' => 366,
        'ytd' => 366,
    ];

    public function __construct(
        private readonly AdminAnalyticsSummaryService $analytics,
    ) {}

    /**
     * GET /api/v1/admin/analytics/summary
     *
     * Auth: admin. Returns pre-aggregated SaaS analytics for the admin
     * dashboard without shipping the full dentist roster to the browser.
     */
    public function summary(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'range' => ['required', 'string', Rule::in(['7d', '30d', '90d', '180d', '365d', 'ytd'])],
            'current_from' => ['required', 'date_format:Y-m-d'],
            'current_to' => ['required', 'date_format:Y-m-d', 'after_or_equal:current_from'],
            'previous_from' => ['required', 'date_format:Y-m-d'],
            'previous_to' => ['required', 'date_format:Y-m-d', 'after_or_equal:previous_from'],
        ]);
        $this->assertBoundedNonOverlappingRanges($validated);

        return response()->json([
            'data' => $this->analytics->summary($validated),
        ]);
    }

    /**
     * Keep chart materialization bounded and reject overlapping comparison
     * periods. The admin endpoint has the same limits as tenant analytics.
     *
     * @param  array<string, mixed>  $validated
     */
    private function assertBoundedNonOverlappingRanges(array $validated): void
    {
        $range = (string) $validated['range'];
        $maxDays = self::MAX_RANGE_DAYS[$range];
        $currentStart = Carbon::parse((string) $validated['current_from'])->startOfDay();
        $currentEnd = Carbon::parse((string) $validated['current_to'])->startOfDay();
        $previousStart = Carbon::parse((string) $validated['previous_from'])->startOfDay();
        $previousEnd = Carbon::parse((string) $validated['previous_to'])->startOfDay();

        $errors = [];
        if (((int) $currentStart->diffInDays($currentEnd)) + 1 > $maxDays) {
            $errors['current_to'] = ['The current analytics period is too large for the selected range.'];
        }
        if (((int) $previousStart->diffInDays($previousEnd)) + 1 > $maxDays) {
            $errors['previous_to'] = ['The previous analytics period is too large for the selected range.'];
        }
        if ($previousEnd->greaterThanOrEqualTo($currentStart)) {
            $errors['previous_to'] = ['The previous analytics period must end before the current period starts.'];
        }

        $envelopeDays = ((int) $previousStart->diffInDays($currentEnd)) + 1;
        if ($envelopeDays > $maxDays * 2) {
            $errors['previous_from'] = ['The analytics comparison periods are too far apart.'];
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }
}
