<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('treatment_images', function (Blueprint $table): void {
            $table->string('upload_id', 100)->nullable()->after('treatment_id');
            $table->unique('upload_id', 'treatment_images_upload_id_unique');
        });
    }

    public function down(): void
    {
        Schema::table('treatment_images', function (Blueprint $table): void {
            $table->dropUnique('treatment_images_upload_id_unique');
            $table->dropColumn('upload_id');
        });
    }
};
