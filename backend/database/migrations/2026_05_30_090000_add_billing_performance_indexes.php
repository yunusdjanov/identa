<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Composite indexes for the hot billing/subscription read paths surfaced by
 * the May 2026 audit. Without these, `currentForOwner` (ordered by
 * starts_at desc + id desc per user_id), the PayX webhook lookup
 * (provider_payment_id) and admin payment summary aggregates
 * (status + paid_at) trigger table scans as tenant volume grows.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscriptions', function (Blueprint $table): void {
            // currentForOwner: WHERE user_id = ? ORDER BY starts_at DESC, id DESC LIMIT 1
            $table->index(['user_id', 'starts_at', 'id'], 'subscriptions_user_starts_at_id_idx');
            // Subscriptions:process command scans expired subs.
            $table->index(['status', 'ends_at'], 'subscriptions_status_ends_at_idx');
        });

        Schema::table('billing_payments', function (Blueprint $table): void {
            // PayX webhook: WHERE provider = ? AND provider_payment_id = ?
            $table->index(['provider', 'provider_payment_id'], 'billing_payments_provider_payment_id_idx');
            // Admin payments summary: WHERE status = paid AND paid_at >= X (per currency)
            $table->index(['status', 'paid_at'], 'billing_payments_status_paid_at_idx');
            // Per-dentist history fetch: WHERE user_id = ? ORDER BY created_at DESC
            $table->index(['user_id', 'created_at'], 'billing_payments_user_created_at_idx');
            // Stale-pending detection: WHERE user_id + plan + period + status
            $table->index(['user_id', 'plan_id', 'billing_period', 'status'], 'billing_payments_dedup_idx');
        });
    }

    public function down(): void
    {
        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->dropIndex('subscriptions_user_starts_at_id_idx');
            $table->dropIndex('subscriptions_status_ends_at_idx');
        });

        Schema::table('billing_payments', function (Blueprint $table): void {
            $table->dropIndex('billing_payments_provider_payment_id_idx');
            $table->dropIndex('billing_payments_status_paid_at_idx');
            $table->dropIndex('billing_payments_user_created_at_idx');
            $table->dropIndex('billing_payments_dedup_idx');
        });
    }
};
