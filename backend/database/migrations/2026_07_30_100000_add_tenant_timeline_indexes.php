<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table): void {
            $table->index(
                ['dentist_id', 'created_at'],
                'patients_dentist_created_at_idx'
            );
        });

        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->index(
                ['dentist_id', 'created_at'],
                'audit_logs_dentist_created_at_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->dropIndex('audit_logs_dentist_created_at_idx');
        });

        Schema::table('patients', function (Blueprint $table): void {
            $table->dropIndex('patients_dentist_created_at_idx');
        });
    }
};
