<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('treatment_images', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->unsignedBigInteger('dentist_id');
            $table->uuid('treatment_id');
            $table->string('disk', 32)->default('local');
            $table->string('path');
            $table->string('mime_type', 100);
            $table->unsignedInteger('file_size');
            $table->timestamps();

            $table->foreign('dentist_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('treatment_id')->references('id')->on('treatments')->cascadeOnDelete();
            $table->index(['dentist_id', 'treatment_id']);
        });

        $rows = DB::table('treatments')
            ->select([
                'id',
                'dentist_id',
                'before_image_disk',
                'before_image_path',
                'after_image_disk',
                'after_image_path',
            ])
            ->where(function ($query): void {
                $query
                    ->whereNotNull('before_image_path')
                    ->orWhereNotNull('after_image_path');
            })
            ->get();

        foreach ($rows as $row) {
            $this->insertLegacyImage(
                treatmentId: (string) $row->id,
                dentistId: (int) $row->dentist_id,
                disk: is_string($row->before_image_disk) && trim($row->before_image_disk) !== ''
                    ? trim($row->before_image_disk)
                    : 'local',
                path: is_string($row->before_image_path) ? trim($row->before_image_path) : ''
            );
            $this->insertLegacyImage(
                treatmentId: (string) $row->id,
                dentistId: (int) $row->dentist_id,
                disk: is_string($row->after_image_disk) && trim($row->after_image_disk) !== ''
                    ? trim($row->after_image_disk)
                    : 'local',
                path: is_string($row->after_image_path) ? trim($row->after_image_path) : ''
            );
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('treatment_images');
    }

    private function insertLegacyImage(string $treatmentId, int $dentistId, string $disk, string $path): void
    {
        if ($path === '') {
            return;
        }

        $mimeType = 'application/octet-stream';
        $fileSize = 0;

        try {
            if (Storage::disk($disk)->exists($path)) {
                $mimeType = Storage::disk($disk)->mimeType($path) ?: $mimeType;
                $fileSize = (int) (Storage::disk($disk)->size($path) ?: 0);
            }
        } catch (\Throwable) {
            // Keep migration resilient when legacy files are missing or disk is unavailable.
        }

        $now = now();

        DB::table('treatment_images')->insert([
            'id' => (string) Str::uuid(),
            'dentist_id' => $dentistId,
            'treatment_id' => $treatmentId,
            'disk' => $disk,
            'path' => $path,
            'mime_type' => $mimeType,
            'file_size' => max($fileSize, 0),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
};
