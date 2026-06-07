<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-user push/notification toggles backing the mobile
     * Settings → Notifications sheet. Stored as a single JSON blob (rather
     * than one column per flag) so adding a future toggle is a no-migration
     * change — the controller defaults any missing key. Nullable: a null
     * value means "never customised", and the API fills defaults on read.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->json('notification_preferences')->nullable()->after('last_login_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('notification_preferences');
        });
    }
};
