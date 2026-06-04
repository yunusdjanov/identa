<?php

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('provider', 20)->default('email')->after('password');
            $table->string('google_id')->nullable()->unique()->after('provider');
            $table->string('avatar_url')->nullable()->after('google_id');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->string('password')->nullable()->change();
        });

        Schema::create('plans', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->boolean('is_trial')->default(false);
            $table->boolean('is_paid')->default(false);
            $table->unsignedInteger('trial_days')->nullable();
            $table->decimal('monthly_price', 14, 2)->nullable();
            $table->decimal('yearly_price', 14, 2)->nullable();
            $table->string('currency', 3)->default('UZS');
            $table->unsignedInteger('staff_limit')->default(0);
            $table->unsignedInteger('entry_image_limit')->default(0);
            // Both fields are per-file: upload is the raw size at ingest time,
            // stored is the target size after image optimization. Stored is
            // typically smaller (compression reduces size) but admins can tune
            // either independently.
            $table->decimal('upload_max_mb', 6, 2)->default(1);
            $table->decimal('stored_image_max_mb', 6, 2)->default(0.5);
            $table->boolean('can_export')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained('plans')->restrictOnDelete();
            $table->string('plan_code', 20);
            $table->string('plan_name');
            $table->enum('billing_period', ['trial', 'monthly', 'yearly']);
            $table->enum('status', ['active', 'read_only', 'canceled'])->default('active');
            $table->timestamp('starts_at');
            $table->timestamp('ends_at')->nullable();
            $table->boolean('cancel_at_period_end')->default(false);
            $table->foreignId('pending_plan_id')->nullable()->constrained('plans')->nullOnDelete();
            $table->enum('pending_billing_period', ['monthly', 'yearly'])->nullable();
            $table->timestamp('pending_change_effective_at')->nullable();
            $table->timestamp('expiration_warning_sent_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index(['status', 'ends_at']);
        });

        Schema::create('billing_payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('subscription_id')->nullable()->constrained('subscriptions')->nullOnDelete();
            $table->foreignId('plan_id')->constrained('plans')->restrictOnDelete();
            $table->string('plan_code', 20);
            $table->string('plan_name');
            $table->enum('billing_period', ['monthly', 'yearly']);
            $table->decimal('amount', 14, 2);
            $table->string('currency', 3)->default('UZS');
            $table->enum('status', ['pending', 'paid', 'failed', 'canceled', 'refunded'])->default('pending');
            $table->string('provider', 20)->default('payx');
            $table->string('provider_payment_id')->nullable()->unique();
            $table->string('provider_order_id')->unique();
            $table->json('provider_payload')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index(['status', 'provider']);
        });

        $this->seedDefaultPlans();
        $this->migrateExistingDentistSubscriptions();
    }

    public function down(): void
    {
        Schema::dropIfExists('billing_payments');
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('plans');

        Schema::table('users', function (Blueprint $table): void {
            $table->string('password')->nullable(false)->change();
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique(['google_id']);
            $table->dropColumn(['provider', 'google_id', 'avatar_url']);
        });
    }

    private function seedDefaultPlans(): void
    {
        $now = now();
        $plans = [
            [
                'code' => 'trial',
                'name' => 'Trial',
                'description' => '30 kunlik sinov tarifi',
                'is_trial' => true,
                'is_paid' => false,
                'trial_days' => 30,
                'monthly_price' => null,
                'yearly_price' => null,
                'currency' => 'UZS',
                'staff_limit' => 1,
                'entry_image_limit' => 2,
                'upload_max_mb' => 3,
                'stored_image_max_mb' => 6,
                'can_export' => false,
                'is_active' => true,
                'sort_order' => 10,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'basic',
                'name' => 'Basic',
                'description' => 'Kichik klinikalar uchun asosiy tarif',
                'is_trial' => false,
                'is_paid' => true,
                'trial_days' => null,
                'monthly_price' => 120000,
                'yearly_price' => 1200000,
                'currency' => 'UZS',
                'staff_limit' => 3,
                'entry_image_limit' => 5,
                'upload_max_mb' => 5,
                'stored_image_max_mb' => 25,
                'can_export' => false,
                'is_active' => true,
                'sort_order' => 20,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'pro',
                'name' => 'Pro',
                'description' => 'Kengaytirilgan limitlar va export',
                'is_trial' => false,
                'is_paid' => true,
                'trial_days' => null,
                'monthly_price' => 200000,
                'yearly_price' => 2000000,
                'currency' => 'UZS',
                'staff_limit' => 5,
                'entry_image_limit' => 10,
                'upload_max_mb' => 8,
                'stored_image_max_mb' => 80,
                'can_export' => true,
                'is_active' => true,
                'sort_order' => 30,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ];

        foreach ($plans as $plan) {
            DB::table('plans')->updateOrInsert(
                ['code' => $plan['code']],
                $plan
            );
        }
    }

    private function migrateExistingDentistSubscriptions(): void
    {
        $plansByCode = DB::table('plans')->get()->keyBy('code');
        $now = now();

        DB::table('users')
            ->where('role', User::ROLE_DENTIST)
            ->orderBy('id')
            ->chunkById(100, function ($dentists) use ($plansByCode, $now): void {
                foreach ($dentists as $dentist) {
                    if (DB::table('subscriptions')->where('user_id', $dentist->id)->exists()) {
                        continue;
                    }

                    $legacyPlan = $dentist->subscription_plan;
                    $planCode = match ($legacyPlan) {
                        User::SUBSCRIPTION_PLAN_TRIAL => 'trial',
                        User::SUBSCRIPTION_PLAN_YEARLY => 'pro',
                        User::SUBSCRIPTION_PLAN_MONTHLY => 'basic',
                        default => 'basic',
                    };
                    $plan = $plansByCode->get($planCode) ?? $plansByCode->get('basic');
                    if ($plan === null) {
                        continue;
                    }

                    $startsAt = $dentist->subscription_started_at ?? $dentist->created_at ?? $now;
                    $endsAt = $legacyPlan === User::SUBSCRIPTION_PLAN_TRIAL
                        ? ($dentist->trial_ends_at ?? $dentist->subscription_ends_at)
                        : $dentist->subscription_ends_at;

                    if ($endsAt === null) {
                        $endsAt = $planCode === 'trial'
                            ? CarbonImmutable::parse($startsAt)->addDays((int) ($plan->trial_days ?? 30))
                            : CarbonImmutable::parse($startsAt)->addMonthNoOverflow();
                    }

                    DB::table('subscriptions')->insert([
                        'user_id' => $dentist->id,
                        'plan_id' => $plan->id,
                        'plan_code' => $plan->code,
                        'plan_name' => $plan->name,
                        'billing_period' => $planCode === 'trial'
                            ? 'trial'
                            : ($legacyPlan === User::SUBSCRIPTION_PLAN_YEARLY ? 'yearly' : 'monthly'),
                        'status' => CarbonImmutable::parse($endsAt)->isPast() ? 'read_only' : 'active',
                        'starts_at' => $startsAt,
                        'ends_at' => $endsAt,
                        'cancel_at_period_end' => (bool) $dentist->subscription_cancel_at_period_end,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }
            });
    }
};
