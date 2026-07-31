<?php

namespace Tests\Feature;

use App\Models\BillingPayment;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class BillingLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_payx_paid_webhook_activates_subscription_once(): void
    {
        config()->set('services.payx.project_token', 'test-project-token');

        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $payment = $this->createPendingPayment($dentist, $plan, 'payx-uuid-paid-once', 120000);

        $payload = $this->payxPayload($payment);

        $this->postPayxWebhook($payload)->assertOk();
        $this->postPayxWebhook($payload)->assertOk();

        $this->assertDatabaseHas('billing_payments', [
            'id' => $payment->id,
            'status' => BillingPayment::STATUS_PAID,
            'provider_payment_id' => 'payx-uuid-paid-once',
        ]);

        $this->assertSame(1, Subscription::query()
            ->where('user_id', $dentist->id)
            ->where('plan_code', Plan::CODE_BASIC)
            ->where('status', Subscription::STATUS_ACTIVE)
            ->count());
    }

    public function test_payx_paid_webhook_rejects_amount_mismatch(): void
    {
        config()->set('services.payx.project_token', 'test-project-token');

        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $payment = $this->createPendingPayment($dentist, $plan, 'payx-uuid-bad-amount', 120000);

        $payload = $this->payxPayload($payment, ['amount' => 1]);

        $this->postPayxWebhook($payload)->assertUnprocessable();

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
        // PayX only fires the webhook for successful payments; there is no
        // failed-status webhook. We simulate a terminal payment by marking
        // it failed directly (e.g. set by the merchant after a manual review)
        // and then make sure a late paid webhook cannot resurrect it.
        config()->set('services.payx.project_token', 'test-project-token');

        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $payment = $this->createPendingPayment($dentist, $plan, 'payx-uuid-terminal', 120000);
        $payment->forceFill(['status' => BillingPayment::STATUS_FAILED])->save();

        $this->postPayxWebhook($this->payxPayload($payment))->assertUnprocessable();

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

    public function test_expired_pro_with_pending_downgrade_does_not_auto_activate_basic(): void
    {
        // Best-practice downgrades are scheduled WITHOUT prepayment, so at the
        // period boundary the pending Basic plan must NOT auto-activate a free
        // period. The Pro subscription expires to read-only like any other; the
        // pending plan is preserved purely as a renewal hint, and the tighter
        // Basic staff limit only applies when the owner pays to renew into Basic.
        $dentist = User::factory()->create();
        $pro = $this->createPlan(Plan::CODE_PRO, [
            'monthly_price' => 300000,
            'staff_limit' => 5,
        ]);
        $basic = $this->createPlan(Plan::CODE_BASIC, [
            'monthly_price' => 120000,
            'staff_limit' => 3,
        ]);

        $assistants = User::factory()->count(5)->assistant($dentist)->create([
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);
        foreach ($assistants as $assistant) {
            $assistant->createToken('pre-downgrade-token');
        }

        $subscription = $this->createSubscription($dentist, $pro, [
            // Past the grace window so processing flips it to read-only.
            'ends_at' => now()->subDays(User::SUBSCRIPTION_GRACE_DAYS + 1),
            'pending_plan_id' => $basic->id,
            'pending_billing_period' => Subscription::PERIOD_MONTHLY,
            'pending_change_effective_at' => now()->subDays(User::SUBSCRIPTION_GRACE_DAYS + 1),
        ]);

        Artisan::call('subscriptions:process');

        // Pro subscription is read-only (NOT canceled); the pending downgrade
        // is preserved as a renewal hint.
        $this->assertDatabaseHas('subscriptions', [
            'id' => $subscription->id,
            'status' => Subscription::STATUS_READ_ONLY,
            'pending_plan_id' => $basic->id,
        ]);

        // No free Basic period was granted.
        $this->assertDatabaseMissing('subscriptions', [
            'user_id' => $dentist->id,
            'plan_code' => Plan::CODE_BASIC,
            'status' => Subscription::STATUS_ACTIVE,
        ]);

        // Staff untouched — the Basic staff limit applies only at paid renewal.
        $this->assertSame(5, $dentist->assistants()
            ->where('account_status', User::ACCOUNT_STATUS_ACTIVE)
            ->count());
        $this->assertSame(5, $assistants->count());
    }

    public function test_schedule_downgrade_does_not_charge_and_keeps_pro_until_period_end(): void
    {
        $dentist = User::factory()->create();
        $pro = $this->createPlan(Plan::CODE_PRO, ['monthly_price' => 300000, 'staff_limit' => 5]);
        $basic = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000, 'staff_limit' => 3]);
        $endsAt = now()->addDays(20)->startOfSecond();
        $subscription = $this->createSubscription($dentist, $pro, [
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'ends_at' => $endsAt,
        ]);

        /** @var \App\Services\BillingService $billing */
        $billing = app(\App\Services\BillingService::class);
        $summary = $billing->scheduleDowngrade($dentist, Plan::CODE_BASIC, Subscription::PERIOD_MONTHLY);

        // No payment row was created — a downgrade is free.
        $this->assertSame(0, BillingPayment::query()->where('user_id', $dentist->id)->count());

        // Still on Pro, with the pending downgrade scheduled for period end.
        $subscription->refresh();
        $this->assertSame(Subscription::STATUS_ACTIVE, $subscription->status);
        $this->assertSame((string) $basic->id, (string) $subscription->pending_plan_id);
        $this->assertTrue($subscription->pending_change_effective_at->equalTo($endsAt));
        $this->assertSame(Plan::CODE_PRO, $summary['plan']);
    }

    public function test_create_checkout_refuses_a_downgrade(): void
    {
        config()->set('services.payx.project_token', 'test-project-token');
        config()->set('services.payx.api_token', 'test-api-token');
        config()->set('services.payx.base_url', 'https://test.payx.uz');

        $dentist = User::factory()->create();
        $pro = $this->createPlan(Plan::CODE_PRO, ['monthly_price' => 300000]);
        $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $this->createSubscription($dentist, $pro, [
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'ends_at' => now()->addDays(15),
        ]);

        /** @var \App\Services\BillingService $billing */
        $billing = app(\App\Services\BillingService::class);

        // A paid checkout must refuse a downgrade — it can only be scheduled
        // (free) via scheduleDowngrade().
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $billing->createCheckout($dentist, Plan::CODE_BASIC, Subscription::PERIOD_MONTHLY);
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

    public function test_renew_or_activate_extends_active_subscription_and_clears_cancel_flag(): void
    {
        // A subscription scheduled to cancel at period end must have the
        // cancel flag cleared when an admin (or PayX webhook) extends it —
        // otherwise the dentist would be billed/extended but still get
        // auto-cancelled at the end of the original period.
        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $endsAt = now()->addDays(10)->startOfSecond();
        $subscription = $this->createSubscription($dentist, $plan, [
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'ends_at' => $endsAt,
            'cancel_at_period_end' => true,
        ]);

        /** @var \App\Services\SubscriptionService $service */
        $service = app(\App\Services\SubscriptionService::class);
        $result = $service->renewOrActivate(
            owner: $dentist,
            plan: $plan,
            billingPeriod: Subscription::PERIOD_MONTHLY,
            paymentMethod: 'cash',
            paymentAmount: 120000.0,
        );

        $this->assertSame($subscription->id, $result->id);
        $this->assertSame(Subscription::STATUS_ACTIVE, $result->status);
        $this->assertFalse((bool) $result->cancel_at_period_end);
        // Extended by one month on top of the existing ends_at, not from now.
        $this->assertTrue($result->ends_at->equalTo($endsAt->copy()->addMonthNoOverflow()));
    }

    public function test_renew_or_activate_creates_new_subscription_when_plan_or_period_differs(): void
    {
        // Switching plan (or period within the same plan) must NOT extend the
        // existing subscription — it has to activate a fresh one. The old one
        // is left in place as a historical record (we don't delete history).
        $dentist = User::factory()->create();
        $basic = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $pro = $this->createPlan(Plan::CODE_PRO, ['monthly_price' => 300000, 'yearly_price' => 3000000]);
        $existing = $this->createSubscription($dentist, $basic, [
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'ends_at' => now()->addDays(20),
        ]);

        /** @var \App\Services\SubscriptionService $service */
        $service = app(\App\Services\SubscriptionService::class);
        $result = $service->renewOrActivate(
            owner: $dentist,
            plan: $pro,
            billingPeriod: Subscription::PERIOD_YEARLY,
        );

        $this->assertNotSame($existing->id, $result->id);
        $this->assertSame(Plan::CODE_PRO, $result->plan_code);
        $this->assertSame(Subscription::PERIOD_YEARLY, $result->billing_period);
        $this->assertSame(Subscription::STATUS_ACTIVE, $result->status);
        // ends_at starts from `now()`, not from the old subscription's ends_at.
        $this->assertTrue($result->ends_at->greaterThan(now()->addDays(364)));
        $this->assertTrue($result->ends_at->lessThan(now()->addDays(367)));
    }

    public function test_renew_or_activate_resurrects_read_only_subscription_after_refund_undo(): void
    {
        // When a payment is refunded the subscription is flipped to read_only.
        // Admin can then re-activate by clicking the same plan + period —
        // renewOrActivate should not extend (status not in [ACTIVE,GRACE]) but
        // activate a fresh paid period starting from now.
        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $expiredEndsAt = now()->subDays(5);
        $this->createSubscription($dentist, $plan, [
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'ends_at' => $expiredEndsAt,
            'status' => Subscription::STATUS_READ_ONLY,
        ]);

        /** @var \App\Services\SubscriptionService $service */
        $service = app(\App\Services\SubscriptionService::class);
        $result = $service->renewOrActivate(
            owner: $dentist,
            plan: $plan,
            billingPeriod: Subscription::PERIOD_MONTHLY,
        );

        $this->assertSame(Subscription::STATUS_ACTIVE, $result->status);
        $this->assertTrue($result->ends_at->greaterThan(now()->addDays(29)));
        $this->assertTrue($result->ends_at->lessThan(now()->addDays(32)));
    }

    public function test_cancel_at_period_end_via_service_updates_both_rows_under_lock(): void
    {
        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $endsAt = now()->addDays(15)->startOfSecond();
        $subscription = $this->createSubscription($dentist, $plan, [
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'ends_at' => $endsAt,
            'cancel_at_period_end' => false,
        ]);

        /** @var \App\Services\SubscriptionService $service */
        $service = app(\App\Services\SubscriptionService::class);
        $service->cancelAtPeriodEnd($dentist, 'admin scheduled');

        $subscription->refresh();
        $dentist->refresh();
        $this->assertTrue((bool) $subscription->cancel_at_period_end);
        $this->assertTrue((bool) $dentist->subscription_cancel_at_period_end);
        // ends_at unchanged — access stays full until period ends.
        $this->assertTrue($subscription->ends_at->equalTo($endsAt));
        // Stays ACTIVE — grace handling happens at expiry, not on cancel.
        $this->assertSame(Subscription::STATUS_ACTIVE, $subscription->status);
    }

    public function test_cancel_immediately_via_service_flips_to_read_only_atomically(): void
    {
        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_PRO, ['monthly_price' => 300000]);
        $futureEndsAt = now()->addDays(20);
        $subscription = $this->createSubscription($dentist, $plan, [
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'ends_at' => $futureEndsAt,
        ]);

        /** @var \App\Services\SubscriptionService $service */
        $service = app(\App\Services\SubscriptionService::class);
        $service->cancelImmediately($dentist, 'admin cancel_now');

        $subscription->refresh();
        $dentist->refresh();
        $this->assertSame(Subscription::STATUS_READ_ONLY, $subscription->status);
        // Paid period collapsed to "now" — remaining 20 days forfeited.
        $this->assertTrue($subscription->ends_at->lessThanOrEqualTo(now()->addSeconds(2)));
        $this->assertFalse((bool) $subscription->cancel_at_period_end);
        $this->assertNotNull($dentist->subscription_cancelled_at);
    }

    public function test_schedule_plan_change_refuses_overwrite_with_different_pending(): void
    {
        $dentist = User::factory()->create();
        $pro = $this->createPlan(Plan::CODE_PRO, ['monthly_price' => 300000]);
        $basic = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        // Active Pro sub with an existing pending downgrade to Basic monthly.
        $this->createSubscription($dentist, $pro, [
            'billing_period' => Subscription::PERIOD_YEARLY,
            'ends_at' => now()->addDays(30),
            'pending_plan_id' => $basic->id,
            'pending_billing_period' => Subscription::PERIOD_MONTHLY,
            'pending_change_effective_at' => now()->addDays(30),
        ]);

        /** @var \App\Services\SubscriptionService $service */
        $service = app(\App\Services\SubscriptionService::class);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        // Try to schedule a DIFFERENT pending change (Basic YEARLY this time).
        $service->schedulePlanChange(
            owner: $dentist,
            plan: $basic,
            billingPeriod: Subscription::PERIOD_YEARLY,
        );
    }

    public function test_create_checkout_soft_cancels_stale_pending_payments(): void
    {
        config()->set('services.payx.project_token', 'test-project-token');
        config()->set('services.payx.api_token', 'test-api-token');
        config()->set('services.payx.base_url', 'https://test.payx.uz');

        \Illuminate\Support\Facades\Http::fake([
            'test.payx.uz/api/v1/invoice' => \Illuminate\Support\Facades\Http::response([
                'uuid' => 'payx-uuid-new',
                'pay_url' => 'https://test.payx.uz/pay/new',
                'status' => 'pending',
                'amount' => 120000,
            ]),
        ]);

        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);

        // Create two stale pending payments for the same plan + period.
        // status / provider_order_id / provider_payment_id are guarded (B-C2),
        // so seed via forceFill + save in one shot — `create()` does the INSERT
        // before any post-create hook gets a chance to populate the NOT NULL
        // provider_order_id column.
        $stale1 = (new BillingPayment)->forceFill([
            'user_id' => $dentist->id,
            'plan_id' => $plan->id,
            'plan_code' => $plan->code,
            'plan_name' => $plan->name,
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'amount' => 120000,
            'currency' => 'UZS',
            'provider' => BillingPayment::PROVIDER_PAYX,
            'status' => BillingPayment::STATUS_PENDING,
            'provider_order_id' => 'ord-stale-1',
            'provider_payment_id' => 'payx-uuid-stale-1',
        ]);
        $stale1->save();
        $stale2 = (new BillingPayment)->forceFill([
            'user_id' => $dentist->id,
            'plan_id' => $plan->id,
            'plan_code' => $plan->code,
            'plan_name' => $plan->name,
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'amount' => 120000,
            'currency' => 'UZS',
            'provider' => BillingPayment::PROVIDER_PAYX,
            'status' => BillingPayment::STATUS_PENDING,
            'provider_order_id' => 'ord-stale-2',
            'provider_payment_id' => 'payx-uuid-stale-2',
        ]);
        $stale2->save();

        /** @var \App\Services\BillingService $billing */
        $billing = app(\App\Services\BillingService::class);
        $billing->createCheckout($dentist, Plan::CODE_BASIC, Subscription::PERIOD_MONTHLY);

        $staleCount = BillingPayment::query()
            ->where('user_id', $dentist->id)
            ->where('status', BillingPayment::STATUS_CANCELED)
            ->count();
        $pendingCount = BillingPayment::query()
            ->where('user_id', $dentist->id)
            ->where('status', BillingPayment::STATUS_PENDING)
            ->count();

        // Both stale rows canceled, only the new checkout is pending.
        $this->assertSame(2, $staleCount, 'Stale pending payments should be canceled.');
        $this->assertSame(1, $pendingCount, 'Only the newly created checkout should be pending.');
    }

    public function test_create_checkout_refuses_soft_deleted_account(): void
    {
        $deletedDentist = User::factory()->create([
            'account_status' => User::ACCOUNT_STATUS_DELETED,
        ]);
        $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);

        /** @var \App\Services\BillingService $billing */
        $billing = app(\App\Services\BillingService::class);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $billing->createCheckout($deletedDentist, Plan::CODE_BASIC, Subscription::PERIOD_MONTHLY);
    }

    public function test_summary_returns_derived_read_only_when_grace_expired(): void
    {
        // The read path no longer flips status to READ_ONLY (the scheduled
        // `subscriptions:process` command owns that mutation). Summary must
        // still surface the read-only state derivedly so the API contract
        // stays stable in the window between grace expiry and the next cron.
        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $this->createSubscription($dentist, $plan, [
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'status' => Subscription::STATUS_ACTIVE,
            // Past grace window (paid period + grace days).
            'ends_at' => now()->subDays(User::SUBSCRIPTION_GRACE_DAYS + 5),
        ]);

        /** @var \App\Services\SubscriptionService $service */
        $service = app(\App\Services\SubscriptionService::class);
        $summary = $service->summary($dentist);

        $this->assertSame('read_only', $summary['status']);
        $this->assertSame('read_only', $summary['access_mode']);
        $this->assertTrue((bool) $summary['is_read_only']);
    }

    public function test_mark_read_only_clears_legacy_payment_fields(): void
    {
        $dentist = User::factory()->create([
            'subscription_payment_method' => 'cash',
            'subscription_payment_amount' => 150000,
        ]);
        $plan = $this->createPlan(Plan::CODE_BASIC, ['monthly_price' => 120000]);
        $this->createSubscription($dentist, $plan, [
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'ends_at' => now()->addDays(15),
        ]);

        /** @var \App\Services\SubscriptionService $service */
        $service = app(\App\Services\SubscriptionService::class);
        $service->markReadOnly($dentist, 'refund cascade');

        $dentist->refresh();
        $this->assertNull($dentist->subscription_payment_method, 'Legacy payment_method must be cleared.');
        $this->assertNull($dentist->subscription_payment_amount, 'Legacy payment_amount must be cleared.');
    }

    public function test_plan_downgrade_auto_blocks_excess_active_staff(): void
    {
        // Downgrading from Pro (staff_limit 5) to Basic (staff_limit 3) must
        // keep the 3 most-recently-active assistants and block the rest. This
        // is the safety net for the UI warning — even if admin ignores the
        // warning, the data stays consistent with the new plan limit.
        $dentist = User::factory()->create();
        $pro = $this->createPlan(Plan::CODE_PRO, [
            'monthly_price' => 300000,
            'staff_limit' => 5,
        ]);
        $basic = $this->createPlan(Plan::CODE_BASIC, [
            'monthly_price' => 120000,
            'staff_limit' => 3,
        ]);

        // Existing Pro subscription with 5 active assistants.
        $this->createSubscription($dentist, $pro, [
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'ends_at' => now()->addDays(20),
        ]);
        $assistants = User::factory()->count(5)->assistant($dentist)->create([
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);

        /** @var \App\Services\SubscriptionService $service */
        $service = app(\App\Services\SubscriptionService::class);
        $service->renewOrActivate(
            owner: $dentist,
            plan: $basic,
            billingPeriod: Subscription::PERIOD_MONTHLY,
        );

        $activeCount = $dentist->assistants()
            ->where('account_status', User::ACCOUNT_STATUS_ACTIVE)
            ->count();
        $blockedCount = $dentist->assistants()
            ->where('account_status', User::ACCOUNT_STATUS_BLOCKED)
            ->count();

        $this->assertSame(3, $activeCount, 'Basic plan limits to 3 active staff.');
        $this->assertSame(2, $blockedCount, '2 excess assistants must be auto-blocked.');
        $this->assertSame(5, $assistants->count(), 'No assistants are deleted.');

        $blockedIds = $dentist->assistants()
            ->where('account_status', User::ACCOUNT_STATUS_BLOCKED)
            ->pluck('id');
        $this->assertSame(
            0,
            DB::table('personal_access_tokens')->whereIn('tokenable_id', $blockedIds)->count(),
        );
    }

    public function test_analytics_subscription_snapshot_preserves_grace_status_without_extra_queries(): void
    {
        $dentist = User::factory()->create();
        $plan = $this->createPlan(Plan::CODE_BASIC);
        $this->createSubscription($dentist, $plan, [
            'ends_at' => now()->subDay(),
        ]);

        $analyticsOwner = User::query()
            ->select(['id', 'created_at', 'account_status'])
            ->with([
                'latestSubscription' => static function (\Illuminate\Database\Eloquent\Relations\HasOne $subscription): void {
                    $subscription->select([
                        'subscriptions.id as id',
                        'subscriptions.user_id as user_id',
                        'subscriptions.plan_code as plan_code',
                        'subscriptions.billing_period as billing_period',
                        'subscriptions.status as status',
                        'subscriptions.starts_at as starts_at',
                        'subscriptions.ends_at as ends_at',
                    ]);
                },
            ])
            ->findOrFail($dentist->id);
        $service = app(\App\Services\SubscriptionService::class);

        DB::flushQueryLog();
        DB::enableQueryLog();
        $snapshot = $service->analyticsSnapshot($analyticsOwner);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        $this->assertSame(User::SUBSCRIPTION_STATUS_GRACE, $snapshot['status']);
        $this->assertSame(Plan::CODE_BASIC, $snapshot['plan']);
        $this->assertSame(Subscription::PERIOD_MONTHLY, $snapshot['billing_period']);
        $this->assertNull($snapshot['trial_ends_at']);
        $this->assertSame([], $queries, 'The aggregate snapshot must use the eager-loaded subscription.');
    }

    /**
     * @param  array<string, mixed>  $overrides
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
     * @param  array<string, mixed>  $overrides
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

    /**
     * Create a pending BillingPayment that emulates what `createCheckout()`
     * stores after PayX responds with a uuid. The `$payxUuid` argument is
     * used as the provider_payment_id so the webhook handler can match it
     * back to this row via the transaction_id PayX sends.
     */
    private function createPendingPayment(
        User $dentist,
        Plan $plan,
        string $payxUuid,
        float $amount,
    ): BillingPayment {
        // BillingPayment `$fillable` was tightened (B-C2) to only allow user_id,
        // plan_id, plan_code, plan_name, billing_period, amount, currency,
        // provider — every provider-side / status field must come through the
        // service layer, not mass assignment. Tests still need to seed a
        // pending payment in the same shape `createCheckout()` would, so we
        // forceFill everything (including the guarded provider_* columns) and
        // save in one shot — `create()` would do an INSERT before we get a
        // chance to forceFill, hitting the NOT NULL constraint on
        // provider_order_id.
        $payment = (new BillingPayment)->forceFill([
            'user_id' => $dentist->id,
            'plan_id' => $plan->id,
            'plan_code' => $plan->code,
            'plan_name' => $plan->name,
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'amount' => $amount,
            'currency' => 'UZS',
            'provider' => BillingPayment::PROVIDER_PAYX,
            'status' => BillingPayment::STATUS_PENDING,
            'provider_order_id' => 'ord-'.$payxUuid,
            'provider_payment_id' => $payxUuid,
            'provider_payload' => ['metadata' => ['change_type' => 'immediate']],
        ]);
        $payment->save();

        return $payment;
    }

    /**
     * Build a webhook payload that mirrors the example shown in PayX docs:
     * { user_id, amount, currency, transaction_id, timestamp }.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payxPayload(BillingPayment $payment, array $overrides = []): array
    {
        return array_merge([
            'user_id' => $payment->user_id,
            'amount' => (float) $payment->amount,
            'currency' => $payment->currency,
            'transaction_id' => $payment->provider_payment_id,
            'timestamp' => now()->timestamp,
        ], $overrides);
    }

    /**
     * Send a PayX webhook authenticated with `Authorization: Bearer
     * {project_token}` exactly as PayX itself does.
     *
     * @param  array<string, mixed>  $payload
     */
    private function postPayxWebhook(array $payload): \Illuminate\Testing\TestResponse
    {
        $content = json_encode($payload, JSON_THROW_ON_ERROR);
        $token = (string) config('services.payx.project_token');

        return $this->call(
            'POST',
            '/api/v1/webhooks/payx',
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_ACCEPT' => 'application/json',
                'HTTP_AUTHORIZATION' => 'Bearer '.$token,
            ],
            $content,
        );
    }
}
