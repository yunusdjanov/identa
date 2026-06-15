<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('patient_clinical_photos', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('dentist_id')->constrained('users')->cascadeOnDelete();
            $table->uuid('patient_id');
            $table->string('view_type', 32)->default('smile');
            $table->boolean('is_primary')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->string('disk', 32)->default('local');
            $table->string('path');
            $table->string('mime_type', 100);
            $table->unsignedInteger('file_size')->default(0);
            $table->string('scan_status', 32)->default('approved');
            $table->string('scan_result', 255)->nullable();
            $table->string('scan_provider', 64)->nullable();
            $table->string('quarantine_path', 2048)->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('scanned_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->timestamps();

            $table->foreign('patient_id')->references('id')->on('patients')->cascadeOnDelete();
            $table->unique(['patient_id', 'view_type']);
            $table->index(['dentist_id', 'patient_id']);
            $table->index(['patient_id', 'view_type', 'is_primary']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('patient_clinical_photos');
    }
};
