<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Treatment;
use App\Models\User;
use App\Services\AnalyticsSummaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AnalyticsController extends Controller
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
            'currency' => ['sometimes', 'string', Rule::in(Treatment::SUPPORTED_CURRENCIES)],
        ]);
        $this->assertBoundedNonOverlappingRanges($validated);
        $validated['currency'] = (string) ($validated['currency'] ?? Treatment::CURRENCY_UZS);

        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => $this->analytics->summary($user, $validated),
        ]);
    }

    /**
     * Prevent a permitted user from turning a small chart endpoint into an
     * unbounded multi-year materialization query.
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
