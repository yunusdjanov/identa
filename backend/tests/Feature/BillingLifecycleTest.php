<?php

namespace Tests\Feature;

use App\Models\BillingPayment;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class BillingLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_payx_paid_webhook_activates_subscription_once(): void
    {
        config()->set('services.payx.webhook_secret', 'test-webhook-secret');

        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $payment = $this->createPendingPayment($dentist, $plan, 'payx-order-paid-once', 120000);

        $payload = $this->payxPayload($payment, 'paid');

        $this->postSignedPayxWebhook($payload)->assertOk();
        $this->postSignedPayxWebhook($payload)->assertOk();

        $this->assertDatabaseHas('billing_payments', [
            'id' => $payment->id,
            'status' => BillingPayment::STATUS_PAID,
            'provider_payment_id' => 'payx-payment-payx-order-paid-once',
        ]);

        $this->assertSame(1, Subscription::query()
            ->where('user_id', $dentist->id)
            ->where('plan_code', Plan::CODE_BASIC)
            ->where('status', Subscription::STATUS_ACTIVE)
            ->count());
    }

    public function test_payx_paid_webhook_rejects_amount_mismatch(): void
    {
        config()->set('services.payx.webhook_secret', 'test-webhook-secret');

        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $payment = $this->createPendingPayment($dentist, $plan, 'payx-order-bad-amount', 120000);

        $payload = $this->payxPayload($payment, 'paid', ['amount' => 1]);

        $this->postSignedPayxWebhook($payload)->assertUnprocessable();

        $this->assertDatabaseHas('billing_payments', [
            'id' => $payment->id,
            'status' => BillingPayment::STATUS_PENDING,
            'paid_at' => null,
        ]);
        $this->assertDatabaseMissing('subscriptions', [
            'user_id' => $dentist->id,
            'plan_code' => Plan::CODE_BASIC,
            'status' => Subscription::STATUS_ACTIVE,
        ]);
    }

    public function test_terminal_payx_payment_cannot_later_activate_subscription(): void
    {
        config()->set('services.payx.webhook_secret', 'test-webhook-secret');

        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $payment = $this->createPendingPayment($dentist, $plan, 'payx-order-terminal', 120000);

        $this->postSignedPayxWebhook($this->payxPayload($payment, 'failed'))->assertOk();
        $this->postSignedPayxWebhook($this->payxPayload($payment, 'paid'))->assertUnprocessable();

        $this->assertDatabaseHas('billing_payments', [
            'id' => $payment->id,
            'status' => BillingPayment::STATUS_FAILED,
        ]);
        $this->assertDatabaseMissing('subscriptions', [
            'user_id' => $dentist->id,
            'plan_code' => Plan::CODE_BASIC,
            'status' => Subscription::STATUS_ACTIVE,
        ]);
    }

    public function test_expired_trial_is_moved_to_read_only_by_subscription_processor(): void
    {
        $dentist = User::factory()->create();
        $trial = $this->createPlan(Plan::CODE_TRIAL, [
            'is_trial' => true,
            'is_paid' => false,
            'trial_days' => 30,
            'monthly_price' => null,
            'yearly_price' => null,
        ]);

        $subscription = $this->createSubscription($dentist, $trial, [
            'billing_period' => Subscription::PERIOD_TRIAL,
            'ends_at' => now()->subMinute(),
        ]);

        Artisan::call('subscriptions:process');

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'status' => Subscription::STATUS_READ_ONLY,
        ]);
    }

    public function test_expired_pro_subscription_activates_pending_basic_and_applies_staff_selection(): void
    {
        $dentist = User::factory()->create();
        $pro = $this->createPlan(Plan::CODE_PRO, [
            'monthly_price' => 300000,
            'yearly_price' => 3000000,
            'staff_limit' => 5,
            'can_export' => true,
        ]);
        $basic = $this->createPlan(Plan::CODE_BASIC, [
            'monthly_price' => 120000,
            'yearly_price' => 1200000,
            'staff_limit' => 3,
            'can_export' => false,
        ]);

        $assistants = User::factory()->count(5)->assistant($dentist)->create([
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);
        $selectedIds = $assistants->take(3)->pluck('id')->all();
        $blockedIds = $assistants->slice(3)->pluck('id')->all();

        $subscription = $this->createSubscription($dentist, $pro, [
            'ends_at' => now()->subMinute(),
            'pending_plan_id' => $basic->id,
            'pending_billing_period' => Subscription::PERIOD_MONTHLY,
            'pending_change_effective_at' => now()->subMinute(),
            'pending_active_staff_ids' => $selectedIds,
        ]);

        Artisan::call('subscriptions:process');

        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'status' => Subscription::STATUS_CANCELED,
        ]);
        $this->assertDatabaseHas('subscriptions', [
            'user_id' => $dentist->id,
            'plan_code' => Plan::CODE_BASIC,
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'status' => Subscription::STATUS_ACTIVE,
        ]);

        foreach ($selectedIds as $assistantId) {
            $this->assertDatabaseHas('users', [
                'id' => $assistantId,
                'account_status' => User::ACCOUNT_STATUS_ACTIVE,
            ]);
        }

        foreach ($blockedIds as $assistantId) {
            $this->assertDatabaseHas('users', [
                'id' => $assistantId,
                'account_status' => User::ACCOUNT_STATUS_BLOCKED,
            ]);
        }
    }

    public function test_subscription_expiration_warning_is_marked_once(): void
    {
        $now = CarbonImmutable::parse('2026-05-05 09:00:00');
        $this->travelTo($now);

        $dentist = User::factory()->create(['email' => 'warning@example.com']);
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $subscription = $this->createSubscription($dentist, $plan, [
            'ends_at' => $now->addHours(12),
            'expiration_warning_sent_at' => null,
        ]);

        Artisan::call('subscriptions:process');
        $firstWarningSentAt = $subscription->fresh()->expiration_warning_sent_at;

        $this->assertNotNull($firstWarningSentAt);

        $this->travelTo($now->addHour());
        Artisan::call('subscriptions:process');

        $this->assertTrue($firstWarningSentAt->equalTo($subscription->fresh()->expiration_warning_sent_at));
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private function createPlan(string $code, array $overrides = []): Plan
    {
        $attributes = array_merge([
            'code' => $code,
            'name' => ucfirst($code),
            'description' => null,
            'is_trial' => $code === Plan::CODE_TRIAL,
            'is_paid' => $code !== Plan::CODE_TRIAL,
            'trial_days' => $code === Plan::CODE_TRIAL ? 30 : null,
            'monthly_price' => $code === Plan::CODE_TRIAL ? null : 120000,
            'yearly_price' => $code === Plan::CODE_TRIAL ? null : 1200000,
            'currency' => 'UZS',
            'staff_limit' => match ($code) {
                Plan::CODE_PRO => 5,
                Plan::CODE_BASIC => 3,
                default => 1,
            },
            'entry_image_limit' => $code === Plan::CODE_PRO ? 10 : 2,
            'upload_max_mb' => $code === Plan::CODE_PRO ? 5 : 1,
            'stored_image_max_mb' => $code === Plan::CODE_PRO ? 1 : 0.5,
            'can_export' => $code === Plan::CODE_PRO,
            'is_active' => true,
            'sort_order' => 10,
        ], $overrides);

        /** @var Plan $plan */
        $plan = Plan::query()->updateOrCreate(
            ['code' => $code],
            $attributes,
        );

        return $plan;
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private function createSubscription(User $dentist, Plan $plan, array $overrides = []): Subscription
    {
        /** @var Subscription $subscription */
        $subscription = Subscription::query()->create(array_merge([
            'user_id' => $dentist->id,
            'plan_id' => $plan->id,
            'plan_code' => $plan->code,
            'plan_name' => $plan->name,
            'billing_period' => $plan->code === Plan::CODE_TRIAL
                ? Subscription::PERIOD_TRIAL
                : Subscription::PERIOD_MONTHLY,
            'status' => Subscription::STATUS_ACTIVE,
            'starts_at' => now()->subMonth(),
            'ends_at' => now()->addMonth(),
            'cancel_at_period_end' => false,
        ], $overrides));

        return $subscription;
    }

    private function createPendingPayment(
        User $dentist,
        Plan $plan,
        string $orderId,
        float $amount,
    ): BillingPayment {
        /** @var BillingPayment $payment */
        $payment = BillingPayment::query()->create([
            'user_id' => $dentist->id,
            'plan_id' => $plan->id,
            'plan_code' => $plan->code,
            'plan_name' => $plan->name,
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'amount' => $amount,
            'currency' => 'UZS',
            'status' => BillingPayment::STATUS_PENDING,
            'provider' => BillingPayment::PROVIDER_PAYX,
            'provider_order_id' => $orderId,
            'provider_payload' => ['metadata' => ['change_type' => 'immediate']],
        ]);

        return $payment;
    }

    /**
     * @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function payxPayload(BillingPayment $payment, string $status, array $overrides = []): array
    {
        return array_merge([
            'order_id' => $payment->provider_order_id,
            'payment_id' => 'payx-payment-'.$payment->provider_order_id,
            'status' => $status,
            'amount' => (float) $payment->amount,
            'currency' => $payment->currency,
        ], $overrides);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function postSignedPayxWebhook(array $payload): \Illuminate\Testing\TestResponse
    {
        $content = json_encode($payload, JSON_THROW_ON_ERROR);

        return $this->call(
            'POST',
            '/api/v1/webhooks/payx',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_X_PAYX_SIGNATURE' => hash_hmac(
                    'sha256',
                    $content,
                    (string) config('services.payx.webhook_secret'),
                ),
            ],
            $content,
        );
    }
}
