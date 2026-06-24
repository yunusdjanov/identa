<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('appointments', function (Blueprint $table): void {
            $table->dropForeign(['patient_id']);
            $table->uuid('patient_id')->nullable()->change();
            $table->string('guest_name')->nullable()->after('patient_id');
            $table->string('guest_phone', 50)->nullable()->after('guest_name');
            $table->index(['dentist_id', 'guest_phone'], 'appointments_guest_phone_idx');
            $table->foreign('patient_id')->references('id')->on('patients')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('appointments', function (Blueprint $table): void {
            $table->dropForeign(['patient_id']);
            $table->dropIndex('appointments_guest_phone_idx');
            $table->dropColumn(['guest_name', 'guest_phone']);
            $table->uuid('patient_id')->nullable(false)->change();
            $table->foreign('patient_id')->references('id')->on('patients')->cascadeOnDelete();
        });
    }
};
