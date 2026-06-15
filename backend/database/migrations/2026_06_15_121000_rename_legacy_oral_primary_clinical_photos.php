<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (! Schema::hasTable('patient_clinical_photos')) {
            return;
        }

        DB::table('patient_clinical_photos')
            ->where('view_type', 'oral_primary')
            ->get(['id', 'patient_id'])
            ->each(function ($photo): void {
                $hasSmile = DB::table('patient_clinical_photos')
                    ->where('patient_id', $photo->patient_id)
                    ->where('view_type', 'smile')
                    ->exists();

                if (! $hasSmile) {
                    DB::table('patient_clinical_photos')
                        ->where('id', $photo->id)
                        ->update(['view_type' => 'smile']);
                }
            });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (! Schema::hasTable('patient_clinical_photos')) {
            return;
        }

        DB::table('patient_clinical_photos')
            ->where('view_type', 'smile')
            ->get(['id', 'patient_id'])
            ->each(function ($photo): void {
                $hasLegacy = DB::table('patient_clinical_photos')
                    ->where('patient_id', $photo->patient_id)
                    ->where('view_type', 'oral_primary')
                    ->exists();

                if (! $hasLegacy) {
                    DB::table('patient_clinical_photos')
                        ->where('id', $photo->id)
                        ->update(['view_type' => 'oral_primary']);
                }
            });
    }
};
