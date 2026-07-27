<?php

namespace App\Services;

use App\Models\BillingPayment;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SubscriptionService
{
    public function __construct(
        private readonly AccountAccessRevocationService $accessRevocation,
    ) {}

    public function currentForOwner(User $owner, bool $forUpdate = false): ?Subscription
    {
        if (! $owner->isDentist()) {
            return null;
        }

        // List endpoints (admin dentist index) eager-load `subscriptions.plan`
        // to batch the otherwise-N+1 subscription fetch. When the relation is
        // already loaded AND we're on a read path, sort the collection in
        // PHP instead of issuing another query.
        if (! $forUpdate && $owner->relationLoaded('subscriptions')) {
            $subscription = $owner->subscriptions
                ->sortByDesc('id')
                ->sortByDesc(fn (Subscription $row): int => $row->starts_at?->getTimestamp() ?? 0)
                ->first();

            return $subscription instanceof Subscription ? $subscription : null;
        }

        $query = $owner->subscriptions()
            ->with('plan')
            ->latest('starts_at')
            ->latest('id');

        // When used inside a transaction by a writer (e.g. renewOrActivate,
        // schedulePlanChange), pass `forUpdate: true` to acquire a row lock and
        // serialize concurrent extensions/activations against the same owner.
        // Without the lock, two admin clicks (or admin + PayX webhook) firing
        // back-to-back can both see the same ends_at and double-record payments
        // while only advancing the period once.
        if ($forUpdate) {
            $query->lockForUpdate();
        }

        /** @var Subscription|null $subscription */
        $subscription = $query->first();

        // Only mutate state on writer paths. Read paths (summary, isReadOnly,
        // planForOwner) return the row as-is — the scheduled `subscriptions:
        // process` command is the canonical place where expired subs are
        // flipped to read_only. summary() already derives the "grace" state
        // from `ends_at->isPast()` so the API surface stays accurate without
        // writes in the GET path.
        if ($subscription !== null && $forUpdate) {
            $subscription = $this->handleExpiredSubscription($subscription);
        }

        return $subscription;
    }

    public function processExpiredSubscription(Subscription $subscription): Subscription
    {
        return $this->handleExpiredSubscription($subscription);
    }

    public function startTrial(User $owner, ?string $note = null): Subscription
    {
        return DB::transaction(function () use ($owner, $note): Subscription {
            /** @var Plan $plan */
            $plan = Plan::query()
                ->where('code', Plan::CODE_TRIAL)
                ->lockForUpdate()
                ->firstOrFail();

            $startsAt = now();
            $endsAt = $startsAt->copy()->addDays((int) ($plan->trial_days ?? User::SUBSCRIPTION_TRIAL_DAYS));

            $subscription = $owner->subscriptions()->create([
                'plan_id' => $plan->id,
                'plan_code' => $plan->code,
                'plan_name' => $plan->name,
                'billing_period' => Subscription::PERIOD_TRIAL,
                'status' => Subscription::STATUS_ACTIVE,
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'cancel_at_period_end' => false,
            ]);

            $this->syncLegacyUserColumns(
                owner: $owner,
                planCode: Plan::CODE_TRIAL,
                startsAt: $startsAt,
                endsAt: $endsAt,
                trialEndsAt: $endsAt,
                note: $note,
            );
            $this->applyStaffLimit($owner, $plan);

            return $subscription->load('plan');
        });
    }

    public function ensureTrial(User $owner, ?string $note = null): Subscription
    {
        $current = $this->currentForOwner($owner);
        if ($current !== null) {
            return $current;
        }

        return $this->startTrial($owner, $note);
    }

    public function overridePlan(
        User $owner,
        Plan $plan,
        string $billingPeriod,
        ?string $paymentMethod = null,
        ?float $paymentAmount = null,
        ?string $note = null,
    ): Subscription {
        if ($plan->code === Plan::CODE_TRIAL) {
            return $this->startTrial($owner, $note);
        }

        return $this->renewOrActivate(
            owner: $owner,
            plan: $plan,
            billingPeriod: $billingPeriod,
            paymentMethod: $paymentMethod,
            paymentAmount: $paymentAmount,
            note: $note,
        );
    }

    /**
     * Renew an existing matching subscription (preserves remaining time) or
     * activate a new paid subscription if plan/period differs.
     *
     * Matches Stripe-style billing: a renewal of the same plan adds time on
     * top of the current ends_at; a plan change activates a new subscription
     * from now.
     */
    public function renewOrActivate(
        User $owner,
        Plan $plan,
        string $billingPeriod,
        ?string $paymentMethod = null,
        ?float $paymentAmount = null,
        ?string $note = null,
        ?CarbonInterface $paidAt = null,
    ): Subscription {
        return DB::transaction(function () use (
            $owner,
            $plan,
            $billingPeriod,
            $paymentMethod,
            $paymentAmount,
            $note,
            $paidAt,
        ): Subscription {
            $current = $this->currentForOwner($owner, forUpdate: true);
            // Note: the DB-level status during the grace window is still ACTIVE
            // (the "grace" label is derived in summary() from the past ends_at).
            // After the grace window expires, currentForOwner -> handleExpired-
            // Subscription flips status to READ_ONLY, which falls through to
            // activatePaid (fresh period) — which is the desired behaviour.
            $canExtend = $current !== null
                && $current->plan_id === $plan->id
                && $current->billing_period === $billingPeriod
                && $current->status === Subscription::STATUS_ACTIVE;

            if (! $canExtend) {
                return $this->activatePaid(
                    owner: $owner,
                    plan: $plan,
                    billingPeriod: $billingPeriod,
                    paymentMethod: $paymentMethod,
                    paymentAmount: $paymentAmount,
                    note: $note,
                    paidAt: $paidAt,
                );
            }

            $baseDate = ($current->ends_at !== null && $current->ends_at->isFuture())
                ? $current->ends_at->copy()
                : now();
            $endsAt = $billingPeriod === Subscription::PERIOD_YEARLY
                ? $baseDate->copy()->addYearNoOverflow()
                : $baseDate->copy()->addMonthNoOverflow();

            $current->forceFill([
                'status' => Subscription::STATUS_ACTIVE,
                'ends_at' => $endsAt,
                'cancel_at_period_end' => false,
                // Clear any pending plan change. Without this, an admin who
                // manually extends/overrides the plan would still get the
                // queued downgrade auto-applied at next ends_at by
                // activatePendingChange — silently reverting their override.
                'pending_plan_id' => null,
                'pending_billing_period' => null,
                'pending_change_effective_at' => null,
                'pending_active_staff_ids' => null,
            ])->save();

            $this->syncLegacyUserColumns(
                owner: $owner,
                planCode: $billingPeriod === Subscription::PERIOD_YEARLY
                    ? User::SUBSCRIPTION_PLAN_YEARLY
                    : User::SUBSCRIPTION_PLAN_MONTHLY,
                startsAt: $current->starts_at ?? now(),
                endsAt: $endsAt,
                trialEndsAt: null,
                paymentMethod: $paymentMethod,
                paymentAmount: $paymentAmount,
                note: $note,
            );
            $this->applyStaffLimit($owner, $plan);
            $this->recordManualAdminReceipt($owner, $current, $plan, $billingPeriod, $paymentMethod, $paymentAmount, $paidAt);

            return $current->refresh()->load('plan');
        });
    }

    public function markReadOnly(User $owner, ?string $note = null): Subscription
    {
        return DB::transaction(function () use ($owner, $note): Subscription {
            $subscription = $this->currentForOwner($owner, forUpdate: true);
            if ($subscription === null) {
                // Refuse to silently create a trial just to flip it to READ_ONLY.
                // Admin almost certainly intends to flip an existing paid sub,
                // not invent one — let them choose set_trial explicitly first.
                throw ValidationException::withMessages([
                    'action' => ['Cannot mark read-only: no current subscription. Use set_trial first.'],
                ]);
            }
            $subscription->forceFill([
                'status' => Subscription::STATUS_READ_ONLY,
                'cancel_at_period_end' => false,
            ])->save();

            // Clear the legacy "current payment" mirror so the dentist's
            // billing card no longer shows the now-revoked payment as if it
            // were still funding access. The historical payment row stays
            // intact in billing_payments for the audit trail.
            $owner->forceFill([
                'subscription_cancel_at_period_end' => false,
                'subscription_cancelled_at' => now(),
                'subscription_payment_method' => null,
                'subscription_payment_amount' => null,
                'subscription_note' => $note,
            ])->save();

            return $subscription->refresh()->load('plan');
        });
    }

    /**
     * Schedule a cancellation at the end of the current billing period. The
     * subscription stays ACTIVE with full access until ends_at, then expires
     * normally. Idempotent: re-calling on a sub already flagged is a no-op.
     *
     * Replaces the legacy User::cancelSubscriptionAtPeriodEnd() which performed
     * two unlocked writes (subscription + user legacy columns) and was
     * vulnerable to concurrent webhook race conditions.
     */
    public function cancelAtPeriodEnd(User $owner, ?string $note = null): ?Subscription
    {
        return DB::transaction(function () use ($owner, $note): ?Subscription {
            $subscription = $this->currentForOwner($owner, forUpdate: true);
            if ($subscription === null) {
                return null;
            }

            $subscription->forceFill(['cancel_at_period_end' => true])->save();

            $owner->forceFill([
                'subscription_cancel_at_period_end' => true,
                'subscription_note' => $note,
            ])->save();

            return $subscription->refresh()->load('plan');
        });
    }

    /**
     * Cancel the subscription immediately: access drops to read-only and a
     * cancelled_at timestamp is recorded. For trials the ends_at is moved to
     * "now" so the dentist sees the trial as expired; for paid subs the
     * remaining time is discarded.
     *
     * Replaces the legacy User::cancelSubscriptionImmediately() which mutated
     * the subscription and user rows in two separate unlocked writes.
     */
    public function cancelImmediately(User $owner, ?string $note = null): ?Subscription
    {
        return DB::transaction(function () use ($owner, $note): ?Subscription {
            $cancelledAt = now();
            $subscription = $this->currentForOwner($owner, forUpdate: true);
            if ($subscription === null) {
                return null;
            }

            $isTrial = $subscription->plan_code === Plan::CODE_TRIAL
                || $subscription->billing_period === Subscription::PERIOD_TRIAL;

            $subscription->forceFill([
                'status' => Subscription::STATUS_READ_ONLY,
                'cancel_at_period_end' => false,
                // For trials we keep ends_at (so the trial expiry date stays
                // visible in history); for paid subs we collapse ends_at to
                // the cancellation moment, marking the period as forfeited.
                'ends_at' => $isTrial ? $subscription->ends_at : $cancelledAt,
            ])->save();

            $owner->forceFill([
                'subscription_cancel_at_period_end' => false,
                'subscription_cancelled_at' => $cancelledAt,
                'subscription_ends_at' => $isTrial
                    ? $owner->subscription_ends_at
                    : $cancelledAt,
                'trial_ends_at' => $isTrial ? $cancelledAt : $owner->trial_ends_at,
                'subscription_note' => $note,
            ])->save();

            return $subscription->refresh()->load('plan');
        });
    }

    public function markActive(User $owner, ?string $note = null): Subscription
    {
        return DB::transaction(function () use ($owner, $note): Subscription {
            $subscription = $this->currentForOwner($owner, forUpdate: true);
            if ($subscription === null) {
                throw ValidationException::withMessages([
                    'action' => ['Cannot mark active: no current subscription. Use set_trial or a paid action first.'],
                ]);
            }
            $endsAt = $subscription->ends_at;
            if ($endsAt === null || $endsAt->isPast()) {
                // Extend based on the billing period rather than a flat
                // 30 days — yearly subscribers shouldn't lose 11 months
                // when an admin re-activates an expired row. Trial uses
                // the plan's own `trial_days` (matches startTrial above);
                // a plan with trial_days=14 was previously extended for
                // 30. Fall back to SUBSCRIPTION_TRIAL_DAYS only when the
                // plan row is missing.
                $endsAt = match ($subscription->billing_period) {
                    Subscription::PERIOD_YEARLY => now()->addYearNoOverflow(),
                    Subscription::PERIOD_MONTHLY => now()->addMonthNoOverflow(),
                    default => now()->addDays(
                        (int) ($subscription->plan->trial_days ?? User::SUBSCRIPTION_TRIAL_DAYS)
                    ),
                };
            }

            $subscription->forceFill([
                'status' => Subscription::STATUS_ACTIVE,
                'ends_at' => $endsAt,
                'cancel_at_period_end' => false,
                'expiration_warning_sent_at' => null,
            ])->save();

            $legacyPlan = match ($subscription->plan_code) {
                Plan::CODE_TRIAL => User::SUBSCRIPTION_PLAN_TRIAL,
                default => $subscription->billing_period === Subscription::PERIOD_YEARLY
                    ? User::SUBSCRIPTION_PLAN_YEARLY
                    : User::SUBSCRIPTION_PLAN_MONTHLY,
            };

            $this->syncLegacyUserColumns(
                owner: $owner,
                planCode: $legacyPlan,
                startsAt: $subscription->starts_at ?? now(),
                endsAt: $endsAt,
                trialEndsAt: $subscription->plan_code === Plan::CODE_TRIAL ? $endsAt : null,
                paymentMethod: $owner->subscription_payment_method,
                paymentAmount: $owner->subscription_payment_amount !== null
                    ? (float) $owner->subscription_payment_amount
                    : null,
                note: $note,
            );
            $this->applyStaffLimit($owner, $subscription->plan);

            return $subscription->refresh()->load('plan');
        });
    }

    public function activatePaid(
        User $owner,
        Plan $plan,
        string $billingPeriod,
        ?string $paymentMethod = null,
        ?float $paymentAmount = null,
        ?string $note = null,
        ?CarbonInterface $paidAt = null,
    ): Subscription {
        return DB::transaction(function () use (
            $owner,
            $plan,
            $billingPeriod,
            $paymentMethod,
            $paymentAmount,
            $note,
            $paidAt,
        ): Subscription {
            // Lock the owner User row so two concurrent admin "Activate
            // monthly" clicks cannot both pass through with currentForOwner()
            // returning null and INSERT two parallel ACTIVE subscriptions.
            // currentForOwner(forUpdate: true) already locks the existing
            // Subscription row, but on first-paid-activation there is no
            // existing row to lock — the User-row lock closes that gap.
            User::query()
                ->whereKey($owner->id)
                ->lockForUpdate()
                ->first();

            $startsAt = $paidAt?->copy() ?? now();
            $endsAt = $billingPeriod === Subscription::PERIOD_YEARLY
                ? $startsAt->copy()->addYearNoOverflow()
                : $startsAt->copy()->addMonthNoOverflow();

            $subscription = $owner->subscriptions()->create([
                'plan_id' => $plan->id,
                'plan_code' => $plan->code,
                'plan_name' => $plan->name,
                'billing_period' => $billingPeriod,
                'status' => Subscription::STATUS_ACTIVE,
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'cancel_at_period_end' => false,
            ]);

            $this->syncLegacyUserColumns(
                owner: $owner,
                planCode: $billingPeriod === Subscription::PERIOD_YEARLY
                    ? User::SUBSCRIPTION_PLAN_YEARLY
                    : User::SUBSCRIPTION_PLAN_MONTHLY,
                startsAt: $startsAt,
                endsAt: $endsAt,
                trialEndsAt: null,
                paymentMethod: $paymentMethod,
                paymentAmount: $paymentAmount,
                note: $note,
            );
            $this->applyStaffLimit($owner, $plan);
            $this->recordManualAdminReceipt($owner, $subscription, $plan, $billingPeriod, $paymentMethod, $paymentAmount, $paidAt);

            return $subscription->load('plan');
        });
    }

    /**
     * Persist an admin-recorded off-line receipt (cash / p2p / bank transfer)
     * as a BillingPayment row so the same surfaces that show PayX revenue
     * (admin /admin/payments, dentist /billing payment history, refund
     * cascade, audit log filters) also reflect admin-collected revenue.
     *
     * Skipped when this is a PayX activation (no manual payment_method) or
     * a state-only mutation (mark_active/cancel) that does not record money.
     */
    private function recordManualAdminReceipt(
        User $owner,
        Subscription $subscription,
        Plan $plan,
        string $billingPeriod,
        ?string $paymentMethod,
        ?float $paymentAmount,
        ?CarbonInterface $paidAt,
    ): void {
        if ($paymentMethod === null || $paymentAmount === null || $paymentAmount <= 0) {
            return;
        }
        // Skip when this activation is being driven by a PayX webhook — the
        // webhook handler writes the canonical BillingPayment row itself.
        if ($paymentMethod === BillingPayment::PROVIDER_PAYX) {
            return;
        }

        $payment = new BillingPayment;
        $payment->fill([
            'user_id' => $owner->id,
            'subscription_id' => $subscription->id,
            'plan_id' => $plan->id,
            'plan_code' => $plan->code,
            'plan_name' => $plan->name,
            'billing_period' => $billingPeriod,
            'amount' => round($paymentAmount, 2),
            'currency' => $plan->currency,
            'provider' => BillingPayment::PROVIDER_MANUAL_ADMIN,
        ]);
        // Provider-side identity fields are non-fillable on the model; set
        // them via forceFill the same way PayX checkout creation does.
        $payment->forceFill([
            'status' => BillingPayment::STATUS_PAID,
            'provider_order_id' => 'man-'.Str::lower(Str::random(20)),
            'provider_payment_id' => null,
            'provider_payload' => [
                'channel' => $paymentMethod,
                'recorded_by_admin' => true,
            ],
            'paid_at' => $paidAt ?? now(),
        ])->save();
    }

    public function isReadOnly(User $user): bool
    {
        $owner = $user->subscriptionOwner();
        if ($owner === null) {
            return false;
        }

        $subscription = $this->currentForOwner($owner);

        if ($subscription !== null) {
            return $subscription->status === Subscription::STATUS_READ_ONLY;
        }

        return $this->legacySubscriptionIsReadOnly($owner);
    }

    public function staffLimit(User $owner): ?int
    {
        $plan = $this->planForOwner($owner);

        return $plan !== null ? (int) $plan->staff_limit : null;
    }

    public function entryImageLimit(User $owner): ?int
    {
        $plan = $this->planForOwner($owner);

        return $plan !== null ? (int) $plan->entry_image_limit : null;
    }

    public function uploadMaxBytes(User $owner): ?int
    {
        $plan = $this->planForOwner($owner);

        return $plan !== null ? $this->megabytesToBytes((float) $plan->upload_max_mb) : null;
    }

    public function storedImageMaxBytes(User $owner): ?int
    {
        $plan = $this->planForOwner($owner);

        return $plan !== null ? $this->megabytesToBytes((float) $plan->stored_image_max_mb) : null;
    }

    public function canExport(User $owner): bool
    {
        $plan = $this->planForOwner($owner);

        return (bool) ($plan?->can_export ?? false);
    }

    /**
     * @param  list<int|string>  $selectedActiveStaffIds
     */
    public function schedulePlanChange(
        User $owner,
        Plan $plan,
        string $billingPeriod,
        array $selectedActiveStaffIds = [],
    ): Subscription {
        return DB::transaction(function () use ($owner, $plan, $billingPeriod, $selectedActiveStaffIds): Subscription {
            $subscription = $this->currentForOwner($owner, forUpdate: true);
            if ($subscription === null) {
                return $this->activatePaid(
                    owner: $owner,
                    plan: $plan,
                    billingPeriod: $billingPeriod,
                    note: 'Scheduled change without existing subscription',
                );
            }

            // Idempotent overwrite of the *same* pending change is fine
            // (admin or webhook re-fires), but silently dropping a *different*
            // pending change leaks the prior payment intent. Refuse so the
            // caller can refund / reconcile the earlier pending row.
            if (
                $subscription->pending_plan_id !== null
                && (
                    (string) $subscription->pending_plan_id !== (string) $plan->id
                    || $subscription->pending_billing_period !== $billingPeriod
                )
            ) {
                throw ValidationException::withMessages([
                    'pending_change' => [
                        'A different plan change is already scheduled for this subscription. '.
                        'Cancel the existing pending change before scheduling a new one.',
                    ],
                ]);
            }

            $subscription->forceFill([
                'pending_plan_id' => $plan->id,
                'pending_billing_period' => $billingPeriod,
                'pending_change_effective_at' => $subscription->ends_at,
                'pending_active_staff_ids' => $this->normalizeStaffIds($selectedActiveStaffIds),
            ])->save();

            return $subscription->refresh()->load('plan');
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function summary(User $owner): array
    {
        $subscription = $this->currentForOwner($owner);
        $plan = $subscription?->plan;
        $endsAt = $subscription?->ends_at;

        // Derived grace state: a paid subscription whose period has ended but is
        // still inside the grace window keeps full access (status stays ACTIVE
        // in the DB) while surfacing a "grace" status + deadline to the client.
        $graceEndsAt = $subscription !== null ? $this->graceDeadline($subscription) : null;
        $inGrace = $subscription?->status === Subscription::STATUS_ACTIVE
            && $endsAt !== null
            && $endsAt->isPast()
            && $graceEndsAt !== null
            && $graceEndsAt->isAfter($endsAt)
            && now()->lt($graceEndsAt);

        // Derived read-only state: either the DB status is already READ_ONLY,
        // OR the paid period + grace window have both elapsed but the
        // scheduled `subscriptions:process` command hasn't flipped the row
        // yet. This keeps the API contract stable in the gap between the
        // grace deadline and the next cron tick.
        $isReadOnly = $subscription?->status === Subscription::STATUS_READ_ONLY
            || (
                $subscription?->status === Subscription::STATUS_ACTIVE
                && $endsAt !== null
                && $endsAt->isPast()
                && ! $inGrace
            );

        return [
            'is_configured' => $subscription !== null,
            'plan' => $subscription?->plan_code,
            'plan_name' => $subscription?->plan_name,
            'billing_period' => $subscription?->billing_period,
            'status' => $inGrace
                ? User::SUBSCRIPTION_STATUS_GRACE
                : ($isReadOnly
                    ? User::SUBSCRIPTION_STATUS_READ_ONLY
                    : ($subscription?->status ?? User::SUBSCRIPTION_STATUS_NONE)),
            'access_mode' => $isReadOnly
                ? User::SUBSCRIPTION_ACCESS_READ_ONLY
                : User::SUBSCRIPTION_ACCESS_FULL,
            'starts_at' => $subscription?->starts_at?->toIso8601String(),
            'ends_at' => $endsAt?->toIso8601String(),
            'trial_ends_at' => $subscription?->billing_period === Subscription::PERIOD_TRIAL
                ? $endsAt?->toIso8601String()
                : null,
            'grace_ends_at' => $inGrace ? $graceEndsAt->toIso8601String() : null,
            'cancel_at_period_end' => (bool) ($subscription?->cancel_at_period_end ?? false),
            'cancelled_at' => $owner->subscription_cancelled_at?->toIso8601String(),
            'pending_plan_id' => $subscription?->pending_plan_id !== null ? (string) $subscription->pending_plan_id : null,
            'pending_plan_code' => $this->resolvePendingPlanField($subscription, 'code'),
            'pending_plan_name' => $this->resolvePendingPlanField($subscription, 'name'),
            'pending_billing_period' => $subscription?->pending_billing_period,
            'pending_change_effective_at' => $subscription?->pending_change_effective_at?->toIso8601String(),
            'days_remaining' => $endsAt !== null
                ? now()->startOfDay()->diffInDays($endsAt->copy()->startOfDay(), false)
                : null,
            'staff_limit' => $plan !== null ? (int) $plan->staff_limit : null,
            'active_staff_count' => $owner->activeAssistantsCount(),
            'entry_image_limit' => $plan !== null ? (int) $plan->entry_image_limit : null,
            'upload_max_mb' => $plan !== null ? (float) $plan->upload_max_mb : null,
            'stored_image_max_mb' => $plan !== null ? (float) $plan->stored_image_max_mb : null,
            'can_export' => (bool) ($plan?->can_export ?? false),
            'is_read_only' => $isReadOnly,
            'payment_method' => $owner->subscription_payment_method,
            'payment_amount' => $owner->subscription_payment_amount !== null
                ? (float) $owner->subscription_payment_amount
                : null,
            'note' => $owner->subscription_note,
        ];
    }

    /**
     * Resolve the human-readable code/name for the plan a subscription is
     * scheduled to switch to at period end. Returns null when no pending
     * change is set, or when the target plan row has been deleted/disabled.
     */
    private function resolvePendingPlanField(?Subscription $subscription, string $field): ?string
    {
        if ($subscription === null || $subscription->pending_plan_id === null) {
            return null;
        }

        $plan = Plan::query()->find($subscription->pending_plan_id);
        if ($plan === null) {
            return null;
        }

        return $field === 'name' ? $plan->name : $plan->code;
    }

    private function handleExpiredSubscription(Subscription $subscription): Subscription
    {
        if (
            $subscription->status !== Subscription::STATUS_ACTIVE
            || $subscription->ends_at === null
            || $subscription->ends_at->isFuture()
        ) {
            return $subscription;
        }

        // Note: a scheduled downgrade (pending_plan_id) is NOT auto-activated
        // here. Best-practice downgrades are scheduled WITHOUT prepayment, so
        // there is nothing paid to activate at the period boundary — the
        // subscription simply expires (grace → read-only) like any other, and
        // the pending plan is preserved purely as a renewal hint that the
        // billing UI pre-selects. It is consumed when the owner pays to renew
        // (renewOrActivate clears the pending fields). Auto-granting a free
        // Basic period here would hand out unpaid service.

        // Paid subscriptions get a short grace window after expiry before being
        // locked to read-only; free trials lock immediately (no grace).
        if (now()->lt($this->graceDeadline($subscription))) {
            // Still within grace — keep full access. Status stays ACTIVE in the
            // DB; summary() surfaces a derived "grace" status + grace_ends_at.
            return $subscription;
        }

        $subscription->forceFill(['status' => Subscription::STATUS_READ_ONLY])->save();

        return $subscription->refresh()->load('plan');
    }

    /**
     * The instant an expired subscription should flip to read-only: the paid
     * period end plus the grace window (no grace for trials).
     */
    private function graceDeadline(Subscription $subscription): CarbonInterface
    {
        $endsAt = $subscription->ends_at ?? now();
        $isPaidPeriod = in_array(
            $subscription->billing_period,
            [Subscription::PERIOD_MONTHLY, Subscription::PERIOD_YEARLY],
            true
        );

        return $isPaidPeriod
            ? $endsAt->copy()->addDays(User::SUBSCRIPTION_GRACE_DAYS)
            : $endsAt->copy();
    }

    private function megabytesToBytes(float $megabytes): int
    {
        return (int) floor($megabytes * 1024 * 1024);
    }

    private function planForOwner(User $owner): ?Plan
    {
        $subscription = $this->currentForOwner($owner);
        if ($subscription?->plan !== null) {
            return $subscription->plan;
        }

        $legacyPlan = $owner->subscription_plan;
        $planCode = match ($legacyPlan) {
            User::SUBSCRIPTION_PLAN_TRIAL => Plan::CODE_TRIAL,
            User::SUBSCRIPTION_PLAN_YEARLY, Plan::CODE_PRO => Plan::CODE_PRO,
            User::SUBSCRIPTION_PLAN_MONTHLY, Plan::CODE_BASIC => Plan::CODE_BASIC,
            default => null,
        };

        return $planCode !== null
            ? Plan::query()->where('code', $planCode)->first()
            : null;
    }

    private function legacySubscriptionIsReadOnly(User $owner): bool
    {
        return match ($owner->subscription_plan) {
            User::SUBSCRIPTION_PLAN_TRIAL => $owner->trial_ends_at !== null && $owner->trial_ends_at->isPast(),
            User::SUBSCRIPTION_PLAN_MONTHLY, User::SUBSCRIPTION_PLAN_YEARLY => $owner->subscription_ends_at !== null && $owner->subscription_ends_at->isPast(),
            default => false,
        };
    }

    /**
     * @param  list<int|string>  $preferredActiveStaffIds
     */
    private function applyStaffLimit(User $owner, ?Plan $plan, array $preferredActiveStaffIds = []): void
    {
        if ($plan === null) {
            return;
        }

        $limit = (int) $plan->staff_limit;
        if ($preferredActiveStaffIds !== []) {
            $preferredIds = $this->normalizeStaffIds($preferredActiveStaffIds);
            $owner->assistants()
                ->whereIn('id', $preferredIds)
                ->update(['account_status' => User::ACCOUNT_STATUS_ACTIVE]);
        }

        $activeAssistantIds = $owner->assistants()
            ->where('account_status', User::ACCOUNT_STATUS_ACTIVE)
            ->when($preferredActiveStaffIds !== [], function ($query) use ($preferredActiveStaffIds) {
                $preferredIds = $this->normalizeStaffIds($preferredActiveStaffIds);
                $query->orderByRaw('CASE WHEN id IN ('.implode(',', array_fill(0, count($preferredIds), '?')).') THEN 0 ELSE 1 END', $preferredIds);
            })
            ->orderByDesc('last_login_at')
            ->orderByDesc('updated_at')
            ->orderByDesc('created_at')
            ->pluck('id')
            ->all();

        if (count($activeAssistantIds) <= $limit) {
            return;
        }

        $assistantIdsToBlock = array_slice($activeAssistantIds, $limit);
        if ($assistantIdsToBlock === []) {
            return;
        }

        $assistantsToBlock = $owner->assistants()
            ->whereIn('id', $assistantIdsToBlock)
            ->get();

        User::query()
            ->whereIn('id', $assistantIdsToBlock)
            ->update(['account_status' => User::ACCOUNT_STATUS_BLOCKED]);

        $this->accessRevocation->revokeForUsers($assistantsToBlock);
    }

    /**
     * @param  list<int|string>  $ids
     * @return list<int>
     */
    private function normalizeStaffIds(array $ids): array
    {
        return array_values(array_unique(array_filter(
            array_map(static fn ($id): int => (int) $id, $ids),
            static fn (int $id): bool => $id > 0,
        )));
    }

    private function syncLegacyUserColumns(
        User $owner,
        string $planCode,
        CarbonInterface $startsAt,
        ?CarbonInterface $endsAt,
        ?CarbonInterface $trialEndsAt,
        ?string $paymentMethod = null,
        ?float $paymentAmount = null,
        ?string $note = null,
    ): void {
        $owner->forceFill([
            'subscription_plan' => $planCode,
            'subscription_started_at' => $startsAt,
            'subscription_ends_at' => $planCode === Plan::CODE_TRIAL ? null : $endsAt,
            'trial_ends_at' => $trialEndsAt,
            'subscription_cancel_at_period_end' => false,
            'subscription_cancelled_at' => null,
            'subscription_payment_method' => $paymentMethod,
            'subscription_payment_amount' => $paymentAmount,
            'subscription_note' => $note,
        ])->save();
    }
}
