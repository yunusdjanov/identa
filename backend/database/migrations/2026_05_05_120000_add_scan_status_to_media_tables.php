<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('patients', function (Blueprint $table): void {
            $table->string('scan_status', 32)->default('approved')->after('photo_path');
            $table->string('scan_result', 255)->nullable()->after('scan_status');
            $table->string('scan_provider', 64)->nullable()->after('scan_result');
            $table->string('quarantine_path', 2048)->nullable()->after('scan_provider');
            $table->timestamp('approved_at')->nullable()->after('quarantine_path');
            $table->timestamp('scanned_at')->nullable()->after('approved_at');
            $table->timestamp('rejected_at')->nullable()->after('scanned_at');
        });

        foreach (['treatment_images', 'odontogram_entry_images'] as $table) {
            Schema::table($table, function (Blueprint $table): void {
                $table->string('scan_status', 32)->default('approved')->after('file_size');
                $table->string('scan_result', 255)->nullable()->after('scan_status');
                $table->string('scan_provider', 64)->nullable()->after('scan_result');
                $table->string('quarantine_path', 2048)->nullable()->after('scan_provider');
                $table->timestamp('approved_at')->nullable()->after('quarantine_path');
                $table->timestamp('scanned_at')->nullable()->after('approved_at');
                $table->timestamp('rejected_at')->nullable()->after('scanned_at');
            });
        }
    }

    public function down(): void
    {
        foreach (['patients', 'treatment_images', 'odontogram_entry_images'] as $table) {
            Schema::table($table, function (Blueprint $table): void {
                $table->dropColumn([
                    'scan_status',
                    'scan_result',
                    'scan_provider',
                    'quarantine_path',
                    'approved_at',
                    'scanned_at',
                    'rejected_at',
                ]);
            });
        }
    }
};
