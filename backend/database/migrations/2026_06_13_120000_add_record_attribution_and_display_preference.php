<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('show_record_authors')->default(false);
        });

        foreach (['patients', 'appointments', 'treatments'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) use ($tableName): void {
                $table->foreignId('created_by_user_id')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete();
                $table->foreignId('updated_by_user_id')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete();
                $table->index(['dentist_id', 'created_by_user_id'], "{$tableName}_dentist_created_by_idx");
            });
        }
    }

    public function down(): void
    {
        foreach (['patients', 'appointments', 'treatments'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) use ($tableName): void {
                $table->dropIndex("{$tableName}_dentist_created_by_idx");
                $table->dropForeign(['created_by_user_id']);
                $table->dropForeign(['updated_by_user_id']);
                $table->dropColumn(['created_by_user_id', 'updated_by_user_id']);
            });
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('show_record_authors');
        });
    }
};
