<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patient_categories', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('dentist_id')->constrained('users')->cascadeOnDelete();
            $table->string('name');
            $table->string('color', 16)->default('#CBD5E1');
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['dentist_id', 'name']);
            $table->index(['dentist_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('patient_categories');
    }
};
