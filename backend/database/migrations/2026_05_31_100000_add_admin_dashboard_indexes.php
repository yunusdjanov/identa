<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Composite indexes that back the admin dentist dashboard hot paths.
 *
 * - (role, account_status) — the index page filters by role='dentist'
 *   AND account_status filter; without this the planner falls back to a
 *   sequential scan of users + post-filter on three count(*) aggregates
 *   per request.
 *
 * - (role, created_at) — orderByDesc('created_at') for the paginated list
 *   AND the new-registrations-7d summary aggregate.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->index(['role', 'account_status'], 'users_role_account_status_index');
            $table->index(['role', 'created_at'], 'users_role_created_at_index');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex('users_role_account_status_index');
            $table->dropIndex('users_role_created_at_index');
        });
    }
};
