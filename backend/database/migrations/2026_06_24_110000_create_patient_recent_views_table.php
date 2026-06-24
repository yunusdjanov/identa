<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patient_recent_views', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('dentist_id')->constrained('users')->cascadeOnDelete();
            $table->uuid('patient_id');
            $table->timestamp('viewed_at', 6)->useCurrent();
            $table->timestamps(6);

            $table->foreign('patient_id')->references('id')->on('patients')->cascadeOnDelete();
            $table->unique(['user_id', 'patient_id'], 'patient_recent_views_user_patient_unique');
            $table->index(['user_id', 'dentist_id', 'viewed_at'], 'patient_recent_views_user_dentist_viewed_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('patient_recent_views');
    }
};
