<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Push-notification device registry. One row per (user, Expo push token);
     * re-registering the same token after an app relaunch updates the existing
     * row instead of duplicating it. Deleting a user cascades their devices so
     * we never push to an orphaned token.
     */
    public function up(): void
    {
        Schema::create('devices', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('expo_push_token');
            $table->string('platform', 16);
            $table->string('app_version', 32)->nullable();
            $table->string('device_name', 120)->nullable();
            $table->timestamp('last_registered_at')->nullable();
            $table->timestamps();

            // Dedup target for updateOrCreate — a token is unique per user.
            $table->unique(['user_id', 'expo_push_token']);
            // Reverse lookup when fanning out a push to a token.
            $table->index('expo_push_token');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('devices');
    }
};
