<?php

namespace App\Services;

use App\Models\BillingPayment;
use App\Models\PayxWebhookEvent;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class BillingService
{
    public function __construct(
        private readonly PayxService $payxService,
        private readonly SubscriptionService $subscriptionService,
        private readonly AuditLogger $auditLogger,
    ) {}

    /**
     * @return Collection<int, Plan>
     */
    public function activePlans(): Collection
    {
        return Plan::query()
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function currentSubscriptionSummary(User $user): ?array
    {
        return $user->subscriptionOwner()?->subscriptionSummary();
    }

    /**
     * @return Collection<int, BillingPayment>
     */
    public function paymentHistory(User $user): Collection
    {
        $owner = $user->subscriptionOwner();
        abort_if($owner === null, 403);

        return $owner->billingPayments()
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();
    }

    /**
     * @return array<string, mixed>|null
     */
    public function cancelAtPeriodEnd(User $user): ?array
    {
        // Route through SubscriptionService so the cancellation is recorded
        // under a row lock + transaction. The audit log entry is recorded
        // immediately afterwards so the dentist's intent is traceable.
        $this->subscriptionService->cancelAtPeriodEnd($user, 'Canceled by account owner');

        $this->auditLogger->log(
            actor: $user,
            eventType: 'billing.subscription.cancel_at_period_end_scheduled',
            entityType: 'user',
            entityId: (string) $user->id,
            metadata: [
                'source' => 'dentist_self_service',
            ],
        );

        return $user->refresh()->subscriptionSummary();
    }

    /**
     * @return array{payment: BillingPayment, checkout_url: string}
     */
    /**
     * @param  list<int|string>  $selectedActiveStaffIds
     */
    public function createCheckout(
        User $user,
        string $planCode,
        string $billingPeriod,
        array $selectedActiveStaffIds = [],
    ): array {
        if (! $user->isDentist()) {
            throw ValidationException::withMessages([
                'billing' => ['Only account owners can manage billing.'],
            ]);
        }

        // Soft-deleted accounts must not be able to start a new billing flow.
        // `isDentist()` checks role only, and a deleted dentist keeps role=
        // dentist (account_status='deleted' is our soft-delete signal). A
        // valid session for a deleted account shouldn't reach this code, but
        // defense in depth: refuse explicitly so we never accidentally charge
        // an archived dentist via a stale cookie.
        if ($user->account_status === User::ACCOUNT_STATUS_DELETED) {
            throw ValidationException::withMessages([
                'billing' => ['Account is archived. Restore the account before paying.'],
            ]);
        }

        if (! in_array($planCode, [Plan::CODE_BASIC, Plan::CODE_PRO], true)) {
            throw ValidationException::withMessages([
                'plan_code' => ['Paid plan is required.'],
            ]);
        }

        if (! in_array($billingPeriod, [Subscription::PERIOD_MONTHLY, Subscription::PERIOD_YEARLY], true)) {
            throw ValidationException::withMessages([
                'billing_period' => ['Invalid billing period.'],
            ]);
        }

        /** @var Plan $plan */
        $plan = Plan::query()
            ->where('code', $planCode)
            ->where('is_active', true)
            ->where('is_paid', true)
            ->firstOrFail();

        $amount = $billingPeriod === Subscription::PERIOD_YEARLY
            ? $plan->yearly_price
            : $plan->monthly_price;

        if ($amount === null || (float) $amount <= 0) {
            throw ValidationException::withMessages([
                'plan_code' => ['Plan price is not configured.'],
            ]);
        }

        // Plan.monthly_price/yearly_price are now cast as float for read
        // ergonomics. Round to 2dp before persisting into BillingPayment.amount
        // (decimal:2 column) so a sub-cent float artifact never enters the
        // billing record, and bccomp in the webhook handler matches exactly.
        $amount = round((float) $amount, 2);

        $selectedActiveStaffIds = $this->validateStaffSelection($user, $plan, $selectedActiveStaffIds);

        return DB::transaction(function () use ($user, $plan, $billingPeriod, $amount, $selectedActiveStaffIds): array {
            $subscription = $this->subscriptionService->currentForOwner($user);

            // Soft-cancel any older PENDING payment from the same user for
            // the same plan + period. Without this, a dentist who clicks
            // "Pay" five times in a row would orphan four pending invoices,
            // each capable of activating the subscription if PayX still has
            // them open. We mark them CANCELED so PayX webhooks on those
            // older uuids are explicitly refused (terminal-state guard).
            $stalePendingPayments = BillingPayment::query()
                ->where('user_id', $user->id)
                ->where('plan_id', $plan->id)
                ->where('billing_period', $billingPeriod)
                ->where('status', BillingPayment::STATUS_PENDING)
                ->get(['id']);
            $stalePendingCount = $stalePendingPayments->count();

            if ($stalePendingCount > 0) {
                $staleIds = $stalePendingPayments->pluck('id')->all();
                BillingPayment::query()
                    ->whereIn('id', $staleIds)
                    ->update(['status' => BillingPayment::STATUS_CANCELED]);

                // Audit the cascade — finance + admin diagnostics need a paper
                // trail explaining why these rows flipped from PENDING.
                $this->auditLogger->log(
                    actor: $user,
                    eventType: 'billing.checkout.stale_pending_cancelled',
                    entityType: 'user',
                    entityId: (string) $user->id,
                    metadata: [
                        'plan_code' => $plan->code,
                        'billing_period' => $billingPeriod,
                        'stale_payment_ids' => array_map('strval', $staleIds),
                        'count' => $stalePendingCount,
                    ],
                );
            }

            $metadata = [
                'change_type' => $this->isDeferredDowngrade($subscription, $plan) ? 'deferred_downgrade' : 'immediate',
                'selected_active_staff_ids' => $this->normalizeStaffIds($selectedActiveStaffIds),
                'stale_pending_cancelled_count' => $stalePendingCount,
            ];
            // Tenant-safe fields go through fill(); provider-side identity
            // (status, provider_order_id, provider_payload) is set via forceFill
            // because those columns are non-fillable on the model to block any
            // future user-input path from rewriting them.
            $payment = new BillingPayment();
            $payment->fill([
                'user_id' => $user->id,
                'subscription_id' => $subscription?->id,
                'plan_id' => $plan->id,
                'plan_code' => $plan->code,
                'plan_name' => $plan->name,
                'billing_period' => $billingPeriod,
                'amount' => $amount,
                'currency' => $plan->currency,
                'provider' => BillingPayment::PROVIDER_PAYX,
            ]);
            $payment->forceFill([
                'status' => BillingPayment::STATUS_PENDING,
                'provider_order_id' => $this->generateOrderId(),
                'provider_payload' => [
                    'metadata' => $metadata,
                ],
            ])->save();

            $checkout = $this->payxService->createCheckout($payment, $user);
            $payment->forceFill([
                'provider_payment_id' => $checkout['provider_payment_id'] ?? null,
                'provider_payload' => [
                    'metadata' => $metadata,
                    'payx_checkout' => $this->sanitizePayxPayload($checkout['payload'] ?? []),
                ],
            ])->save();

            // Audit the intent: dentist initiated a paid checkout. The PayX
            // webhook later (or the manual admin action) will log the actual
            // subscription transition; this entry captures the trigger.
            $this->auditLogger->log(
                actor: $user,
                eventType: 'billing.checkout.created',
                entityType: 'billing_payment',
                entityId: (string) $payment->id,
                metadata: [
                    'plan_code' => $plan->code,
                    'billing_period' => $billingPeriod,
                    'amount' => (float) $payment->amount,
                    'currency' => $payment->currency,
                    'provider' => BillingPayment::PROVIDER_PAYX,
                    'provider_order_id' => $payment->provider_order_id,
                    'change_type' => $metadata['change_type'] ?? 'immediate',
                ],
            );

            return [
                'payment' => $payment->refresh(),
                'checkout_url' => (string) $checkout['checkout_url'],
            ];
        });
    }

    /**
     * Whitelist of fields persisted from PayX responses/webhooks. PayX may
     * send payer-identifying or auth-token fields we never want to persist
     * (PII / GDPR concern + secret leakage risk). Anything outside this set
     * is dropped before being written to billing_payments.provider_payload.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function sanitizePayxPayload(array $payload): array
    {
        $allowed = [
            'uuid',
            'pay_url',
            'status',
            'amount',
            'currency',
            'transaction_id',
            'timestamp',
            'user_id',
        ];

        return array_intersect_key($payload, array_flip($allowed));
    }

    /**
     * Handle a PayX webhook.
     *
     * PayX only fires the webhook on successful payments — there is no
     * status field in the payload and no separate failed/refunded events.
     * Refunds and reversals are handled manually by the merchant outside
     * of PayX (it does not expose a refund API). We therefore treat every
     * authenticated webhook as a success notification.
     *
     * Expected payload (per https://payx.uz/docs):
     *   { user_id, amount, currency, transaction_id, timestamp }
     * The webhook is authenticated with `Authorization: Bearer {project_token}`.
     *
     * Time zone contract:
     *   • `paid_at` and subscription period boundaries are computed from
     *     server-side `now()` which honours `config('app.timezone')`. Make
     *     sure APP_TIMEZONE is set explicitly in production (we recommend
     *     UTC for back-office consistency and converting to the tenant's
     *     locale only at the presentation layer).
     *   • The PayX `timestamp` field is INFORMATIONAL only — it lands in
     *     the sanitized provider_payload for forensics but is not used for
     *     any period calculation, so a PayX clock skew can never shift a
     *     subscription's ends_at.
     */
    public function handlePayxWebhook(Request $request): BillingPayment
    {
        if (! $this->payxService->verifyWebhook($request)) {
            throw ValidationException::withMessages([
                'webhook' => ['invalid_payment_webhook'],
            ]);
        }

        $transactionId = trim((string) $request->input('transaction_id'));
        if ($transactionId === '') {
            throw ValidationException::withMessages([
                'transaction_id' => ['Missing transaction id.'],
            ]);
        }

        return DB::transaction(function () use ($request, $transactionId): BillingPayment {
            // The transaction_id PayX sends in the webhook is the uuid we
            // received (and stored as provider_payment_id) when we created
            // the invoice. We additionally scope by provider so that a stale
            // uuid collision (or a future second provider) cannot collide
            // with a PayX webhook and renew the wrong subscription.
            /** @var BillingPayment $payment */
            $payment = BillingPayment::query()
                ->where('provider', BillingPayment::PROVIDER_PAYX)
                ->where('provider_payment_id', $transactionId)
                ->lockForUpdate()
                ->firstOrFail();

            // Idempotency: PayX may deliver the same webhook more than once.
            if ($payment->status === BillingPayment::STATUS_PAID) {
                $this->auditLogger->logFromRequest(
                    request: $request,
                    eventType: 'billing.payx.webhook_duplicate_ignored',
                    entityType: 'billing_payment',
                    entityId: (string) $payment->id,
                    metadata: [
                        'transaction_id' => $transactionId,
                    ],
                );

                // Forensic record so the replay ledger captures the duplicate
                // delivery for downstream analysis (e.g. detecting unusual
                // replay patterns that may indicate a leaked token).
                // UUID suffix instead of microsecond timestamp — two duplicate
                // webhooks delivered in the same microsecond would otherwise
                // collide on the unique constraint and rollback the entire
                // idempotency branch (including this audit row), silently
                // dropping forensic evidence of the replay.
                PayxWebhookEvent::query()->create([
                    'transaction_id' => $transactionId.'_replay_'.Str::uuid()->toString(),
                    'amount' => (string) $payment->amount,
                    'currency' => $payment->currency,
                    'received_at' => now(),
                    'billing_payment_id' => (string) $payment->id,
                    'result_status' => PayxWebhookEvent::RESULT_REJECTED_REPLAY,
                    'rejection_reason' => 'duplicate webhook for already-PAID payment',
                    'ip_address' => $request->ip(),
                ]);

                return $payment;
            }

            // A webhook for an already-terminal payment (failed/canceled)
            // must not silently revive the subscription.
            if ($payment->status !== BillingPayment::STATUS_PENDING) {
                throw ValidationException::withMessages([
                    'payment' => ['Payment is no longer pending.'],
                ]);
            }

            $amount = $request->input('amount');
            if ($amount === null) {
                throw ValidationException::withMessages([
                    'amount' => ['Payment amount is required.'],
                ]);
            }
            // Compare as fixed-precision decimals via BCMath so we don't carry
            // float-subtraction noise. The billing_payments.amount column is
            // decimal:2; anything beyond 2 fractional digits in the webhook
            // payload (PayX is supposed to send integer UZS but third-party
            // gateways occasionally float) is rounded before comparison.
            if (bccomp((string) $amount, (string) $payment->amount, 2) !== 0) {
                throw ValidationException::withMessages([
                    'amount' => ['Payment amount mismatch.'],
                ]);
            }

            // Reject malformed payloads explicitly — PayX is documented to
            // always include a currency, so its absence (or empty string) is
            // an unsafe condition rather than a default-to-our-side situation.
            $currencyInput = $request->input('currency');
            if ($currencyInput === null || (is_string($currencyInput) && trim($currencyInput) === '')) {
                throw ValidationException::withMessages([
                    'currency' => ['Payment currency is required.'],
                ]);
            }
            $currency = strtoupper((string) $currencyInput);
            if ($currency !== strtoupper($payment->currency)) {
                throw ValidationException::withMessages([
                    'currency' => ['Payment currency mismatch.'],
                ]);
            }

            // Write the replay ledger row BEFORE state mutation. The unique
            // constraint on transaction_id is our primary idempotency gate —
            // any concurrent delivery that somehow bypassed the row lock (or a
            // future change that weakens the STATUS_PAID short-circuit) is
            // caught here. If renewOrActivate later throws, the whole
            // transaction rolls back including this row, so the next delivery
            // can re-process from PENDING.
            PayxWebhookEvent::query()->create([
                'transaction_id' => $transactionId,
                'amount' => (string) $payment->amount,
                'currency' => $payment->currency,
                'received_at' => now(),
                'billing_payment_id' => (string) $payment->id,
                'result_status' => PayxWebhookEvent::RESULT_ACCEPTED,
                'rejection_reason' => null,
                'ip_address' => $request->ip(),
            ]);

            $payment->forceFill([
                'status' => BillingPayment::STATUS_PAID,
                'provider_payload' => array_merge($payment->provider_payload ?? [], [
                    'payx_webhook' => $this->sanitizePayxPayload($request->all()),
                ]),
                'paid_at' => now(),
            ])->save();

            /** @var Plan $plan */
            $plan = $payment->plan()->lockForUpdate()->firstOrFail();
            /** @var User $user */
            $user = $payment->user()->firstOrFail();

            // Refuse to revive a deleted account via webhook. The pending
            // payment row stays PAID (PayX already took the money) but the
            // subscription is NOT activated — admin reconciliation needed.
            if ($user->account_status === User::ACCOUNT_STATUS_DELETED) {
                $this->auditLogger->logFromRequest(
                    request: $request,
                    eventType: 'billing.payx.payment_for_deleted_account',
                    entityType: 'billing_payment',
                    entityId: (string) $payment->id,
                    metadata: [
                        'user_id' => (string) $user->id,
                        'transaction_id' => $transactionId,
                        'amount' => (float) $payment->amount,
                        'currency' => $payment->currency,
                    ],
                );

                return $payment->refresh();
            }

            // Race: admin may have deactivated the plan between checkout and
            // webhook delivery. Same shape as the deleted-account guard above —
            // payment stays PAID (PayX took the money) but we do NOT activate
            // the subscription on an inactive plan, because /billing/plans no
            // longer surfaces it and the renewal cycle would silently fail.
            // Admin reconciles manually (refund or re-activate plan).
            if (! (bool) $plan->is_active) {
                $this->auditLogger->logFromRequest(
                    request: $request,
                    eventType: 'billing.payx.payment_for_deactivated_plan',
                    entityType: 'billing_payment',
                    entityId: (string) $payment->id,
                    metadata: [
                        'user_id' => (string) $user->id,
                        'plan_code' => $plan->code,
                        'transaction_id' => $transactionId,
                        'amount' => (float) $payment->amount,
                        'currency' => $payment->currency,
                    ],
                );

                return $payment->refresh();
            }

            $metadata = $payment->provider_payload['metadata'] ?? [];

            if (($metadata['change_type'] ?? null) === 'deferred_downgrade') {
                $subscription = $this->subscriptionService->schedulePlanChange(
                    owner: $user,
                    plan: $plan,
                    billingPeriod: $payment->billing_period,
                    selectedActiveStaffIds: is_array($metadata['selected_active_staff_ids'] ?? null)
                        ? $metadata['selected_active_staff_ids']
                        : [],
                );
                $payment->forceFill(['subscription_id' => $subscription->id])->save();

                $this->auditLogger->logFromRequest(
                    request: $request,
                    eventType: 'billing.payx.deferred_downgrade_scheduled',
                    entityType: 'billing_payment',
                    entityId: (string) $payment->id,
                    metadata: [
                        'user_id' => (string) $user->id,
                        'subscription_id' => (string) $subscription->id,
                        'plan_code' => $plan->code,
                        'billing_period' => $payment->billing_period,
                        'amount' => (float) $payment->amount,
                        'currency' => $payment->currency,
                    ],
                );

                return $payment->refresh();
            }

            $subscription = $this->subscriptionService->renewOrActivate(
                owner: $user,
                plan: $plan,
                billingPeriod: $payment->billing_period,
                paymentMethod: BillingPayment::PROVIDER_PAYX,
                paymentAmount: (float) $payment->amount,
                note: 'PayX payment success',
                paidAt: $payment->paid_at,
            );

            $payment->forceFill(['subscription_id' => $subscription->id])->save();

            // Final success audit — admin's billing detail page surfaces this
            // alongside manual actions for a complete revenue paper trail.
            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'billing.payx.payment_paid',
                entityType: 'billing_payment',
                entityId: (string) $payment->id,
                metadata: [
                    'user_id' => (string) $user->id,
                    'subscription_id' => (string) $subscription->id,
                    'plan_code' => $plan->code,
                    'billing_period' => $payment->billing_period,
                    'amount' => (float) $payment->amount,
                    'currency' => $payment->currency,
                    'transaction_id' => $transactionId,
                    'subscription_ends_at' => $subscription->ends_at?->toIso8601String(),
                ],
            );

            return $payment->refresh();
        });
    }

    private function generateOrderId(): string
    {
        // 24-char base36 random collision odds are astronomically low, but if
        // the unique constraint were ever dropped (intentionally or through
        // a migration mistake), the original do/while would spin forever.
        // Cap at 10 tries — if even one succeeds we ship.
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $orderId = 'idn_'.Str::lower(Str::random(24));
            if (! BillingPayment::query()->where('provider_order_id', $orderId)->exists()) {
                return $orderId;
            }
        }

        throw new RuntimeException('Unable to generate a unique order id after 10 attempts.');
    }

    private function isDeferredDowngrade(?Subscription $subscription, Plan $targetPlan): bool
    {
        return $subscription !== null
            && $subscription->status === Subscription::STATUS_ACTIVE
            && $subscription->ends_at !== null
            && $subscription->ends_at->isFuture()
            && $subscription->plan_code === Plan::CODE_PRO
            && $targetPlan->code === Plan::CODE_BASIC;
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

    /**
     * @param  list<int|string>  $ids
     * @return list<int>
     */
    private function validateStaffSelection(User $user, Plan $plan, array $ids): array
    {
        $selectedIds = $this->normalizeStaffIds($ids);
        $limit = (int) $plan->staff_limit;
        if (count($selectedIds) > $limit) {
            throw ValidationException::withMessages([
                'selected_active_staff_ids' => ['Too many staff members selected for this plan.'],
            ]);
        }

        if ($selectedIds === []) {
            return [];
        }

        $ownedCount = $user->assistants()
            ->where('account_status', User::ACCOUNT_STATUS_ACTIVE)
            ->whereIn('id', $selectedIds)
            ->count();

        if ($ownedCount !== count($selectedIds)) {
            throw ValidationException::withMessages([
                'selected_active_staff_ids' => ['Selected staff members are invalid.'],
            ]);
        }

        return $selectedIds;
    }
}
