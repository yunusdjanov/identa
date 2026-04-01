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
        Schema::create('odontogram_entry_images', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('dentist_id');
            $table->uuid('odontogram_entry_id');
            $table->enum('stage', ['before', 'after']);
            $table->string('disk', 32)->default('local');
            $table->string('path');
            $table->string('mime_type', 100);
            $table->unsignedInteger('file_size');
            $table->date('captured_at')->nullable();
            $table->timestamps();

            $table->foreign('dentist_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('odontogram_entry_id')->references('id')->on('odontogram_entries')->cascadeOnDelete();
            $table->unique(['odontogram_entry_id', 'stage']);
            $table->index(['dentist_id', 'odontogram_entry_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('odontogram_entry_images');
    }
};
