<?php

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
        Schema::table('patient_clinical_photos', function (Blueprint $table): void {
            $table->dropUnique('patient_clinical_photos_patient_id_view_type_unique');
            $table->index(['patient_id', 'view_type', 'sort_order'], 'patient_clinical_photos_patient_view_sort_idx');
        });
    }

    /**
     * Reverse the migrations without deleting gallery data.
     */
    public function down(): void
    {
        Schema::table('patient_clinical_photos', function (Blueprint $table): void {
            $table->dropIndex('patient_clinical_photos_patient_view_sort_idx');
        });

        $hasGalleryRows = DB::table('patient_clinical_photos')
            ->select('patient_id', 'view_type')
            ->groupBy('patient_id', 'view_type')
            ->havingRaw('COUNT(*) > 1')
            ->exists();

        if ($hasGalleryRows) {
            return;
        }

        Schema::table('patient_clinical_photos', function (Blueprint $table): void {
            $table->unique(['patient_id', 'view_type']);
        });
    }
};
