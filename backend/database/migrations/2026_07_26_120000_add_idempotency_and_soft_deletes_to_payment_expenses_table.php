<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_expenses', function (Blueprint $table): void {
            $table->string('idempotency_key', 100)->nullable()->after('expense_date');
            $table->char('idempotency_payload_hash', 64)->nullable()->after('idempotency_key');
            $table->softDeletes();
            $table->unique(
                ['dentist_id', 'idempotency_key'],
                'payment_expenses_dentist_idempotency_unique'
            );
        });
    }

    public function down(): void
    {
        Schema::table('payment_expenses', function (Blueprint $table): void {
            $table->dropUnique('payment_expenses_dentist_idempotency_unique');
            $table->dropColumn([
                'idempotency_key',
                'idempotency_payload_hash',
                'deleted_at',
            ]);
        });
    }
};
