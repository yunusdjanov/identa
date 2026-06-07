<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\BillingPaymentResource;
use App\Http\Resources\PlanResource;
use App\Models\BillingPayment;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BillingController extends Controller
{
    public function __construct(
        private readonly BillingService $billingService,
    ) {}

    public function plans(): JsonResponse
    {
        return response()->json([
            'data' => $this->billingService->activePlans()
                ->map(fn (Plan $plan): array => $this->transformPlan($plan))
                ->values()
                ->all(),
        ]);
    }

    public function currentSubscription(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => $this->billingService->currentSubscriptionSummary($user),
        ]);
    }

    public function checkout(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validated = $request->validate([
            'plan_code' => ['required', 'string', Rule::in([Plan::CODE_BASIC, Plan::CODE_PRO])],
            'billing_period' => ['required', 'string', Rule::in([Subscription::PERIOD_MONTHLY, Subscription::PERIOD_YEARLY])],
            'selected_active_staff_ids' => ['nullable', 'array'],
            'selected_active_staff_ids.*' => ['integer', 'distinct'],
        ]);

        $checkout = $this->billingService->createCheckout(
            user: $user,
            planCode: (string) $validated['plan_code'],
            billingPeriod: (string) $validated['billing_period'],
            selectedActiveStaffIds: $validated['selected_active_staff_ids'] ?? [],
        );

        return response()->json([
            'data' => [
                'checkout_url' => $checkout['checkout_url'],
                'payment' => $this->transformPayment($checkout['payment']),
            ],
        ], 201);
    }

    public function payments(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => $this->billingService->paymentHistory($user)
                ->map(fn (BillingPayment $payment): array => $this->transformPayment($payment))
                ->all(),
        ]);
    }

    public function cancel(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => $this->billingService->cancelAtPeriodEnd($user),
        ]);
    }

    public function changePlan(Request $request): JsonResponse
    {
        return $this->checkout($request);
    }

    /**
     * Schedule a downgrade (Pro → Basic) for the end of the current paid
     * period WITHOUT charging — the best-practice deferred downgrade. Returns
     * the refreshed subscription summary (now carrying the pending change).
     */
    public function downgrade(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validated = $request->validate([
            'plan_code' => ['required', 'string', Rule::in([Plan::CODE_BASIC])],
            'billing_period' => ['required', 'string', Rule::in([Subscription::PERIOD_MONTHLY, Subscription::PERIOD_YEARLY])],
            'selected_active_staff_ids' => ['nullable', 'array'],
            'selected_active_staff_ids.*' => ['integer', 'distinct'],
        ]);

        return response()->json([
            'data' => $this->billingService->scheduleDowngrade(
                user: $user,
                planCode: (string) $validated['plan_code'],
                billingPeriod: (string) $validated['billing_period'],
                selectedActiveStaffIds: $validated['selected_active_staff_ids'] ?? [],
            ),
        ]);
    }

    public function payxWebhook(Request $request): JsonResponse
    {
        $payment = $this->billingService->handlePayxWebhook($request);

        return response()->json([
            'data' => [
                'processed' => true,
                'payment' => $this->transformPayment($payment),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformPlan(Plan $plan): array
    {
        return (new PlanResource($plan))->resolve(request());
    }

    /**
     * @return array<string, mixed>
     */
    private function transformPayment(BillingPayment $payment): array
    {
        return (new BillingPaymentResource($payment))->resolve(request());
    }
}
