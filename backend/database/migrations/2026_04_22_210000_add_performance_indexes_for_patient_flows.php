<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table): void {
            $table->index(
                ['dentist_id', 'patient_id', 'status', 'appointment_date'],
                'appointments_patient_status_date_idx'
            );
        });

        Schema::table('treatment_images', function (Blueprint $table): void {
            $table->index(
                ['treatment_id', 'created_at', 'id'],
                'treatment_images_lookup_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table): void {
            $table->dropIndex('appointments_patient_status_date_idx');
        });

        Schema::table('treatment_images', function (Blueprint $table): void {
            $table->dropIndex('treatment_images_lookup_idx');
        });
    }
};
