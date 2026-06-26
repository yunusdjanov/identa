<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_expenses', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('dentist_id')->constrained('users')->cascadeOnDelete();
            $table->string('title', 160);
            $table->decimal('amount', 12, 2);
            $table->date('expense_date');
            $table->timestamps();

            $table->index(['dentist_id', 'expense_date']);
            $table->index(['dentist_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_expenses');
    }
};
