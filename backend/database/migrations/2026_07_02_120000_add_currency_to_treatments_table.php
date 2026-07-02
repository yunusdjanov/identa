<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('treatments', function (Blueprint $table): void {
            $table->char('currency', 3)->default('UZS')->after('paid_amount');
            $table->index(['dentist_id', 'currency', 'treatment_date'], 'treatments_currency_date_idx');
        });
    }

    public function down(): void
    {
        Schema::table('treatments', function (Blueprint $table): void {
            $table->dropIndex('treatments_currency_date_idx');
            $table->dropColumn('currency');
        });
    }
};
