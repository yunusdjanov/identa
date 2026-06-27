<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_expenses', function (Blueprint $table): void {
            $table->decimal('quantity', 10, 2)->default(1)->after('amount');
            $table->string('currency', 3)->default('UZS')->after('quantity');
            $table->index(['dentist_id', 'currency', 'expense_date'], 'payment_expenses_dentist_currency_date_index');
        });
    }

    public function down(): void
    {
        Schema::table('payment_expenses', function (Blueprint $table): void {
            $table->dropIndex('payment_expenses_dentist_currency_date_index');
            $table->dropColumn(['quantity', 'currency']);
        });
    }
};
