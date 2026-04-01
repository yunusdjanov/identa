<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patient_category_patient', function (Blueprint $table): void {
            $table->uuid('patient_id');
            $table->uuid('patient_category_id');
            $table->timestamps();

            $table->primary(['patient_id', 'patient_category_id']);
            $table
                ->foreign('patient_id')
                ->references('id')
                ->on('patients')
                ->cascadeOnDelete();
            $table
                ->foreign('patient_category_id')
                ->references('id')
                ->on('patient_categories')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('patient_category_patient');
    }
};
