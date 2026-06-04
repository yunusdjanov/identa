<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Replay-protection ledger for PayX webhooks. PayX authenticates with a
 * static project_token (per their docs there is no per-request signature),
 * so if the token leaks an attacker can replay any transaction_id forever.
 * We record every accepted webhook and refuse duplicates explicitly — the
 * BillingPayment.status==PAID idempotency check stays as a defense-in-depth
 * second layer.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payx_webhook_events', function (Blueprint $table): void {
            $table->id();
            $table->string('transaction_id')->unique();
            $table->decimal('amount', 12, 2);
            $table->string('currency', 8);
            $table->timestamp('received_at')->index();
            $table->string('billing_payment_id')->nullable()->index();
            $table->string('result_status', 64)->comment('accepted | rejected_replay | rejected_validation | rejected_terminal');
            $table->string('rejection_reason')->nullable();
            $table->ipAddress('ip_address')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payx_webhook_events');
    }
};
