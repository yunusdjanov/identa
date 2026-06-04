<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdatePlanRequest;
use App\Http\Resources\PlanResource;
use App\Models\Plan;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PlanController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {
    }

    /**
     * List every plan (active and inactive) ordered by display priority.
     * Inactive plans are surfaced so admins can re-activate them; the public
     * billing endpoint filters them out.
     */
    public function index(): JsonResponse
    {
        $plans = Plan::query()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $plans->map(fn (Plan $plan): array => (new PlanResource($plan))->resolve())->values()->all(),
        ]);
    }

    /**
     * Update a plan's editable attributes. Validation is delegated to
     * {@see UpdatePlanRequest}; this method only enforces cross-entity
     * invariants that require a locked Plan row (trial integrity, active
     * subscribers, currency immutability, plan-type invariants) and writes
     * the audit log entry.
     *
     * @throws \Illuminate\Validation\ValidationException If any guard fails.
     * @throws \Symfony\Component\HttpKernel\Exception\NotFoundHttpException If the plan code is unknown.
     */
    public function update(UpdatePlanRequest $request, string $code): JsonResponse
    {
        if (! in_array($code, Plan::CODES, true)) {
            abort(404);
        }

        $validated = $request->validated();

        return DB::transaction(function () use ($code, $request, $validated): JsonResponse {
            /** @var Plan $plan */
            $plan = Plan::query()
                ->where('code', $code)
                ->lockForUpdate()
                ->firstOrFail();

            $this->guardTrialIntegrity($plan, $validated);
            $this->guardActiveSubscribers($plan, $validated);
            $this->guardCurrencyImmutability($plan, $validated);
            $this->applyPlanTypeInvariants($plan, $validated);

            $tracked = [
                'name',
                'description',
                'trial_days',
                'monthly_price',
                'yearly_price',
                'currency',
                'staff_limit',
                'entry_image_limit',
                'upload_max_mb',
                'stored_image_max_mb',
                'can_export',
                'is_active',
                'sort_order',
            ];
            $before = $plan->only($tracked);

            // Identity fields are non-fillable; assign explicitly when admin payload
            // implies a type change (e.g., trial→paid would never legitimately happen,
            // but we still enforce the invariant defensively).
            $plan->is_trial = $validated['is_trial'];
            $plan->is_paid = $validated['is_paid'];
            unset($validated['is_trial'], $validated['is_paid']);

            $plan->fill($validated);
            $plan->save();

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'admin.plan.updated',
                entityType: 'plan',
                entityId: (string) $plan->id,
                metadata: [
                    'code' => $plan->code,
                    'before' => $before,
                    'after' => $plan->fresh()?->only($tracked),
                ],
            );

            return response()->json([
                'data' => (new PlanResource($plan->fresh()))->resolve(),
            ]);
        });
    }

    /**
     * Trial plan is the entrypoint for every new dentist signup. Deactivating it
     * (or flipping its identity) would silently break registration. Block both.
     *
     * @param  array<string, mixed>  $validated
     */
    private function guardTrialIntegrity(Plan $plan, array $validated): void
    {
        if (! $plan->isTrial()) {
            return;
        }

        if (! (bool) $validated['is_active']) {
            throw ValidationException::withMessages([
                'is_active' => ['Trial plan cannot be deactivated; new signups depend on it.'],
            ]);
        }
    }

    /**
     * If subscribers are still attached, deactivating leaves them in a limbo
     * where dashboard, billing, and renewal flows resolve `Plan::active()` to null.
     * Also blocks deactivation while a PayX checkout is mid-flight — the webhook
     * would otherwise activate a subscription on a plan that no longer exists in
     * the public catalog.
     *
     * @param  array<string, mixed>  $validated
     */
    private function guardActiveSubscribers(Plan $plan, array $validated): void
    {
        if ((bool) $validated['is_active']) {
            return;
        }

        $liveCount = $plan->liveSubscriptionsCount();

        if ($liveCount > 0) {
            throw ValidationException::withMessages([
                'is_active' => [sprintf(
                    'Cannot deactivate plan with %d active subscriber%s. Migrate them first.',
                    $liveCount,
                    $liveCount === 1 ? '' : 's',
                )],
            ]);
        }

        $pendingCount = $plan->pendingPaymentsCount();

        if ($pendingCount > 0) {
            throw ValidationException::withMessages([
                'is_active' => [sprintf(
                    'Cannot deactivate plan with %d pending payment%s. Wait for the checkout%s to settle.',
                    $pendingCount,
                    $pendingCount === 1 ? '' : 's',
                    $pendingCount === 1 ? '' : 's',
                )],
            ]);
        }
    }

    /**
     * Once real money has been collected in a currency, switching it silently
     * misrepresents future invoices and pending charges. Lock until billing
     * history is purged or migrated.
     *
     * @param  array<string, mixed>  $validated
     */
    private function guardCurrencyImmutability(Plan $plan, array $validated): void
    {
        if ($plan->currency === $validated['currency']) {
            return;
        }

        if ($plan->hasPaidBillingHistory()) {
            throw ValidationException::withMessages([
                'currency' => ['Currency cannot be changed for a plan that already has paid billing history.'],
            ]);
        }
    }

    /**
     * Trial plan: always free, identity flags pinned. Paid plans: require both prices.
     *
     * @param  array<string, mixed>  $validated
     */
    private function applyPlanTypeInvariants(Plan $plan, array &$validated): void
    {
        if ($plan->isTrial()) {
            $validated['is_trial'] = true;
            $validated['is_paid'] = false;
            $validated['monthly_price'] = 0;
            $validated['yearly_price'] = 0;
            $validated['trial_days'] = $validated['trial_days'] ?? 30;

            return;
        }

        $validated['is_trial'] = false;
        $validated['is_paid'] = true;
        $validated['trial_days'] = null;

        if (! isset($validated['monthly_price']) || (float) $validated['monthly_price'] <= 0) {
            throw ValidationException::withMessages([
                'monthly_price' => ['Monthly price is required for paid plans.'],
            ]);
        }

        if (! isset($validated['yearly_price']) || (float) $validated['yearly_price'] <= 0) {
            throw ValidationException::withMessages([
                'yearly_price' => ['Yearly price is required for paid plans.'],
            ]);
        }

        // Yearly should not be more expensive than 12 monthly cycles — common admin typo.
        $monthly = (float) $validated['monthly_price'];
        $yearly = (float) $validated['yearly_price'];
        if ($yearly > $monthly * 12) {
            throw ValidationException::withMessages([
                'yearly_price' => ['Yearly price cannot exceed twelve monthly cycles.'],
            ]);
        }
    }

}
