<?php

namespace App\Services;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

class SubscriptionService
{
    public function currentForOwner(User $owner): ?Subscription
    {
        if (! $owner->isDentist()) {
            return null;
        }

        /** @var Subscription|null $subscription */
        $subscription = $owner->subscriptions()
            ->with('plan')
            ->latest('starts_at')
            ->latest('id')
            ->first();

        if ($subscription !== null) {
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

        return $this->activatePaid(
            owner: $owner,
            plan: $plan,
            billingPeriod: $billingPeriod,
            paymentMethod: $paymentMethod,
            paymentAmount: $paymentAmount,
            note: $note,
        );
    }

    public function markReadOnly(User $owner, ?string $note = null): Subscription
    {
        return DB::transaction(function () use ($owner, $note): Subscription {
            $subscription = $this->currentForOwner($owner) ?? $this->startTrial($owner, $note);
            $subscription->forceFill([
                'status' => Subscription::STATUS_READ_ONLY,
                'cancel_at_period_end' => false,
            ])->save();

            $owner->forceFill([
                'subscription_cancel_at_period_end' => false,
                'subscription_cancelled_at' => now(),
                'subscription_note' => $note,
            ])->save();

            return $subscription->refresh()->load('plan');
        });
    }

    public function markActive(User $owner, ?string $note = null): Subscription
    {
        return DB::transaction(function () use ($owner, $note): Subscription {
            $subscription = $this->currentForOwner($owner) ?? $this->startTrial($owner, $note);
            $endsAt = $subscription->ends_at;
            if ($endsAt === null || $endsAt->isPast()) {
                $endsAt = now()->addDays(30);
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

            return $subscription->load('plan');
        });
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
     * @param list<int|string> $selectedActiveStaffIds
     */
    public function schedulePlanChange(
        User $owner,
        Plan $plan,
        string $billingPeriod,
        array $selectedActiveStaffIds = [],
    ): Subscription {
        return DB::transaction(function () use ($owner, $plan, $billingPeriod, $selectedActiveStaffIds): Subscription {
            $subscription = $this->currentForOwner($owner);
            if ($subscription === null) {
                return $this->activatePaid(
                    owner: $owner,
                    plan: $plan,
                    billingPeriod: $billingPeriod,
                    note: 'Scheduled change without existing subscription',
                );
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
        $isReadOnly = $subscription?->status === Subscription::STATUS_READ_ONLY;

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

        return [
            'is_configured' => $subscription !== null,
            'plan' => $subscription?->plan_code,
            'plan_name' => $subscription?->plan_name,
            'billing_period' => $subscription?->billing_period,
            'status' => $inGrace
                ? User::SUBSCRIPTION_STATUS_GRACE
                : ($subscription?->status ?? User::SUBSCRIPTION_STATUS_NONE),
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
            'cancelled_at' => null,
            'pending_plan_id' => $subscription?->pending_plan_id !== null ? (string) $subscription->pending_plan_id : null,
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

    private function handleExpiredSubscription(Subscription $subscription): Subscription
    {
        if (
            $subscription->status !== Subscription::STATUS_ACTIVE
            || $subscription->ends_at === null
            || $subscription->ends_at->isFuture()
        ) {
            return $subscription;
        }

        // A scheduled plan change (e.g. downgrade) takes effect at period end.
        if ($subscription->pending_plan_id !== null && $subscription->pending_billing_period !== null) {
            return $this->activatePendingChange($subscription);
        }

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

    private function activatePendingChange(Subscription $subscription): Subscription
    {
        return DB::transaction(function () use ($subscription): Subscription {
            $subscription->refresh();

            if (
                $subscription->pending_plan_id === null
                || $subscription->pending_billing_period === null
            ) {
                $subscription->forceFill(['status' => Subscription::STATUS_READ_ONLY])->save();

                return $subscription->refresh()->load('plan');
            }

            /** @var Plan $plan */
            $plan = Plan::query()->where('id', $subscription->pending_plan_id)->firstOrFail();
            /** @var User $owner */
            $owner = $subscription->user()->firstOrFail();
            $startsAt = $subscription->ends_at?->copy() ?? now();
            $endsAt = $subscription->pending_billing_period === Subscription::PERIOD_YEARLY
                ? $startsAt->copy()->addYearNoOverflow()
                : $startsAt->copy()->addMonthNoOverflow();
            $selectedStaffIds = $subscription->pending_active_staff_ids ?? [];

            $newSubscription = $owner->subscriptions()->create([
                'plan_id' => $plan->id,
                'plan_code' => $plan->code,
                'plan_name' => $plan->name,
                'billing_period' => $subscription->pending_billing_period,
                'status' => Subscription::STATUS_ACTIVE,
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'cancel_at_period_end' => false,
            ]);

            $subscription->forceFill([
                'status' => Subscription::STATUS_CANCELED,
                'pending_plan_id' => null,
                'pending_billing_period' => null,
                'pending_change_effective_at' => null,
                'pending_active_staff_ids' => null,
            ])->save();

            $this->syncLegacyUserColumns(
                owner: $owner,
                planCode: $newSubscription->billing_period === Subscription::PERIOD_YEARLY
                    ? User::SUBSCRIPTION_PLAN_YEARLY
                    : User::SUBSCRIPTION_PLAN_MONTHLY,
                startsAt: $startsAt,
                endsAt: $endsAt,
                trialEndsAt: null,
            );
            $this->applyStaffLimit($owner, $plan, $selectedStaffIds);

            return $newSubscription->load('plan');
        });
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
     * @param list<int|string> $preferredActiveStaffIds
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

        $owner->assistants()
            ->whereIn('id', $assistantIdsToBlock)
            ->update(['account_status' => User::ACCOUNT_STATUS_BLOCKED]);
    }

    /**
     * @param list<int|string> $ids
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
