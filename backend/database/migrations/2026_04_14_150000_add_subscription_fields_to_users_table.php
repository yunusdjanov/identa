<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('subscription_plan', 20)->nullable()->after('account_status');
            $table->timestamp('subscription_started_at')->nullable()->after('subscription_plan');
            $table->timestamp('subscription_ends_at')->nullable()->after('subscription_started_at');
            $table->timestamp('trial_ends_at')->nullable()->after('subscription_ends_at');
            $table->boolean('subscription_cancel_at_period_end')->default(false)->after('trial_ends_at');
            $table->timestamp('subscription_cancelled_at')->nullable()->after('subscription_cancel_at_period_end');
            $table->string('subscription_payment_method', 20)->nullable()->after('subscription_cancelled_at');
            $table->decimal('subscription_payment_amount', 10, 2)->nullable()->after('subscription_payment_method');
            $table->text('subscription_note')->nullable()->after('subscription_payment_amount');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'subscription_plan',
                'subscription_started_at',
                'subscription_ends_at',
                'trial_ends_at',
                'subscription_cancel_at_period_end',
                'subscription_cancelled_at',
                'subscription_payment_method',
                'subscription_payment_amount',
                'subscription_note',
            ]);
        });
    }
};
