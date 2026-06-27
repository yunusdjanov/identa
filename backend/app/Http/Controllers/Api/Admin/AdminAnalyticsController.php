<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\AdminAnalyticsSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdminAnalyticsController extends Controller
{
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

        return response()->json([
            'data' => $this->analytics->summary($validated),
        ]);
    }
}
