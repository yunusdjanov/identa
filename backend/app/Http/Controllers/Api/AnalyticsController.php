<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AnalyticsSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AnalyticsController extends Controller
{
    public function __construct(
        private readonly AnalyticsSummaryService $analytics,
    ) {}

    /**
     * GET /api/v1/analytics/summary
     *
     * Auth: payments.view, patients.view, or appointments.view. Returns the
     * pre-aggregated KPI/chart payload for the dentist analytics page.
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

        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => $this->analytics->summary($user, $validated),
        ]);
    }
}
