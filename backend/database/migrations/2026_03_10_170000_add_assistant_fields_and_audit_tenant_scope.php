<?php

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('dentist_owner_id')
                ->nullable()
                ->after('role')
                ->constrained('users')
                ->nullOnDelete();
            $table->json('assistant_permissions')->nullable()->after('dentist_owner_id');
            $table->boolean('must_change_password')->default(false)->after('assistant_permissions');

            $table->index('dentist_owner_id');
        });

        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->foreignId('dentist_id')
                ->nullable()
                ->after('actor_id')
                ->constrained('users')
                ->nullOnDelete();

            $table->index('dentist_id');
        });

        // Backfill tenant owner for existing logs where actor is present.
        DB::statement("
            UPDATE audit_logs
            SET dentist_id = (
                SELECT CASE
                    WHEN users.role = '".User::ROLE_ASSISTANT."' THEN users.dentist_owner_id
                    ELSE users.id
                END
                FROM users
                WHERE users.id = audit_logs.actor_id
            )
            WHERE actor_id IS NOT NULL
        ");
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('dentist_id');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('dentist_owner_id');
            $table->dropColumn('assistant_permissions');
            $table->dropColumn('must_change_password');
        });
    }
};

