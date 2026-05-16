<?php

namespace App\Services;

use App\Models\BillingPayment;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class BillingService
{
    public function __construct(
        private readonly PayxService $payxService,
        private readonly SubscriptionService $subscriptionService,
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
        $user->cancelSubscriptionAtPeriodEnd('Canceled by account owner');

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

        $selectedActiveStaffIds = $this->validateStaffSelection($user, $plan, $selectedActiveStaffIds);

        return DB::transaction(function () use ($user, $plan, $billingPeriod, $amount, $selectedActiveStaffIds): array {
            $subscription = $this->subscriptionService->currentForOwner($user);
            $metadata = [
                'change_type' => $this->isDeferredDowngrade($subscription, $plan) ? 'deferred_downgrade' : 'immediate',
                'selected_active_staff_ids' => $this->normalizeStaffIds($selectedActiveStaffIds),
            ];
            $payment = BillingPayment::query()->create([
                'user_id' => $user->id,
                'subscription_id' => $subscription?->id,
                'plan_id' => $plan->id,
                'plan_code' => $plan->code,
                'plan_name' => $plan->name,
                'billing_period' => $billingPeriod,
                'amount' => $amount,
                'currency' => $plan->currency,
                'status' => BillingPayment::STATUS_PENDING,
                'provider' => BillingPayment::PROVIDER_PAYX,
                'provider_order_id' => $this->generateOrderId(),
                'provider_payload' => [
                    'metadata' => $metadata,
                ],
            ]);

            $checkout = $this->payxService->createCheckout($payment, $user);
            $payment->forceFill([
                'provider_payment_id' => $checkout['provider_payment_id'] ?? null,
                'provider_payload' => [
                    'metadata' => $metadata,
                    'payx_checkout' => $checkout['payload'] ?? null,
                ],
            ])->save();

            return [
                'payment' => $payment->refresh(),
                'checkout_url' => (string) $checkout['checkout_url'],
            ];
        });
    }

    public function handlePayxWebhook(Request $request): BillingPayment
    {
        if (! $this->payxService->verifyWebhook($request)) {
            throw ValidationException::withMessages([
                'webhook' => ['invalid_payment_webhook'],
            ]);
        }

        $orderId = $this->extractOrderId($request);
        if ($orderId === '') {
            throw ValidationException::withMessages([
                'provider_order_id' => ['Missing order id.'],
            ]);
        }

        return DB::transaction(function () use ($request, $orderId): BillingPayment {
            /** @var BillingPayment $payment */
            $payment = BillingPayment::query()
                ->where('provider_order_id', $orderId)
                ->lockForUpdate()
                ->firstOrFail();

            $status = $this->extractWebhookStatus($request);
            $providerPaymentId = $this->extractProviderPaymentId($request);
            $amount = $request->input('amount') ?? data_get($request->input('data'), 'amount');
            $currency = (string) ($request->input('currency') ?? data_get($request->input('data'), 'currency') ?? $payment->currency);

            if ($providerPaymentId !== null) {
                $providerPaymentIdExists = BillingPayment::query()
                    ->where('provider_payment_id', $providerPaymentId)
                    ->where($payment->getKeyName(), '!=', $payment->getKey())
                    ->exists();

                if ($providerPaymentIdExists) {
                    throw ValidationException::withMessages([
                        'provider_payment_id' => ['Payment provider id is already attached to another order.'],
                    ]);
                }
            }

            if ($payment->status === BillingPayment::STATUS_PAID && $status !== BillingPayment::STATUS_REFUNDED) {
                return $payment;
            }

            if (
                $status === BillingPayment::STATUS_PAID
                && ! in_array($payment->status, [BillingPayment::STATUS_PENDING, BillingPayment::STATUS_PAID], true)
            ) {
                throw ValidationException::withMessages([
                    'payment' => ['Payment is no longer pending.'],
                ]);
            }

            if ($status === BillingPayment::STATUS_PAID && $amount === null) {
                throw ValidationException::withMessages([
                    'amount' => ['Payment amount is required for paid webhooks.'],
                ]);
            }

            if ($amount !== null && abs(((float) $amount) - ((float) $payment->amount)) > 0.01) {
                throw ValidationException::withMessages([
                    'amount' => ['Payment amount mismatch.'],
                ]);
            }

            if (strtoupper($currency) !== strtoupper($payment->currency)) {
                throw ValidationException::withMessages([
                    'currency' => ['Payment currency mismatch.'],
                ]);
            }

            if ($status !== BillingPayment::STATUS_PAID) {
                $payment->forceFill([
                    'status' => $status ?? $payment->status,
                    'provider_payment_id' => $providerPaymentId ?: $payment->provider_payment_id,
                    'provider_payload' => array_merge($payment->provider_payload ?? [], [
                        'payx_webhook' => $request->all(),
                    ]),
                ])->save();

                return $payment->refresh();
            }

            $payment->forceFill([
                'status' => BillingPayment::STATUS_PAID,
                'provider_payment_id' => $providerPaymentId ?: $payment->provider_payment_id,
                'provider_payload' => array_merge($payment->provider_payload ?? [], [
                    'payx_webhook' => $request->all(),
                ]),
                'paid_at' => now(),
            ])->save();

            /** @var Plan $plan */
            $plan = $payment->plan()->firstOrFail();
            /** @var User $user */
            $user = $payment->user()->firstOrFail();
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

                return $payment->refresh();
            }

            $subscription = $this->subscriptionService->activatePaid(
                owner: $user,
                plan: $plan,
                billingPeriod: $payment->billing_period,
                paymentMethod: BillingPayment::PROVIDER_PAYX,
                paymentAmount: (float) $payment->amount,
                note: 'PayX payment success',
                paidAt: $payment->paid_at,
            );

            $payment->forceFill(['subscription_id' => $subscription->id])->save();

            return $payment->refresh();
        });
    }

    private function extractOrderId(Request $request): string
    {
        return trim((string) (
            $request->input('provider_order_id')
            ?? $request->input('order_id')
            ?? $request->input('identifier')
            ?? data_get($request->input('data'), 'provider_order_id')
            ?? data_get($request->input('data'), 'order_id')
            ?? data_get($request->input('data'), 'identifier')
            ?? ''
        ));
    }

    private function extractProviderPaymentId(Request $request): ?string
    {
        $providerPaymentId = $request->input('provider_payment_id')
            ?? $request->input('payment_id')
            ?? $request->input('transaction_id')
            ?? data_get($request->input('data'), 'provider_payment_id')
            ?? data_get($request->input('data'), 'payment_id')
            ?? data_get($request->input('data'), 'transaction_id');

        if (! is_scalar($providerPaymentId)) {
            return null;
        }

        $providerPaymentId = trim((string) $providerPaymentId);

        return $providerPaymentId !== '' ? $providerPaymentId : null;
    }

    private function extractWebhookStatus(Request $request): ?string
    {
        $status = strtolower(trim((string) (
            $request->input('status')
            ?? data_get($request->input('data'), 'status')
            ?? ''
        )));

        return match ($status) {
            'success', 'paid', 'completed', 'complete', 'approved' => BillingPayment::STATUS_PAID,
            'failed', 'failure', 'error', 'declined' => BillingPayment::STATUS_FAILED,
            'canceled', 'cancelled', 'cancel' => BillingPayment::STATUS_CANCELED,
            'refunded', 'refund' => BillingPayment::STATUS_REFUNDED,
            'pending', 'created', 'processing', 'waiting' => BillingPayment::STATUS_PENDING,
            default => null,
        };
    }

    private function generateOrderId(): string
    {
        do {
            $orderId = 'idn_'.Str::lower(Str::random(24));
        } while (BillingPayment::query()->where('provider_order_id', $orderId)->exists());

        return $orderId;
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
