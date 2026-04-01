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
        Schema::create('odontogram_entries', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('dentist_id')->constrained('users')->cascadeOnDelete();
            $table->uuid('patient_id');
            $table->unsignedTinyInteger('tooth_number');
            $table->enum('condition_type', ['healthy', 'cavity', 'filling', 'crown', 'root_canal', 'extraction', 'implant']);
            $table->string('surface', 50)->nullable();
            $table->string('material', 100)->nullable();
            $table->string('severity', 50)->nullable();
            $table->date('condition_date');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->foreign('patient_id')->references('id')->on('patients')->cascadeOnDelete();
            $table->index(['dentist_id', 'patient_id']);
            $table->index(['dentist_id', 'tooth_number']);
            $table->index(['dentist_id', 'condition_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('odontogram_entries');
    }
};
