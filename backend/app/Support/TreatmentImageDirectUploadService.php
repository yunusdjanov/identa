<?php

namespace App\Support;

use App\Jobs\DeleteStoredMediaPaths;
use App\Jobs\GenerateMediaVariants;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class TreatmentImageDirectUploadService
{
    private const MAX_IMAGES_PER_TREATMENT = 10;
    private const DIRECT_UPLOAD_TTL_MINUTES = 15;
    private const IMAGE_VARIANT_THUMBNAIL = 'thumbnail';
    private const IMAGE_VARIANT_PREVIEW = 'preview';
    private const THUMBNAIL_MAX_EDGE = 200;
    private const PREVIEW_MAX_EDGE = 1280;
    private const JPEG_VARIANT_QUALITY = 82;
    private const WEBP_VARIANT_QUALITY = 80;

    /**
     * @var array<string, int>
     */
    private const IMAGE_VARIANT_MAX_EDGES = [
        self::IMAGE_VARIANT_THUMBNAIL => self::THUMBNAIL_MAX_EDGE,
        self::IMAGE_VARIANT_PREVIEW => self::PREVIEW_MAX_EDGE,
    ];

    /**
     * @param list<array{client_id: string, filename: string, content_type: string, file_size: int}> $files
     * @return array{supported: bool, uploads?: list<array<string, mixed>>, expires_at?: string}
     */
    public function prepareBatch(
        int $dentistId,
        string $patientId,
        Treatment $treatment,
        array $files
    ): array {
        $disk = $this->mediaDisk();
        if (! $this->mediaDiskSupportsDirectUpload($disk)) {
            return ['supported' => false];
        }

        $existingImagesCount = $treatment->images()->count();
        if ($existingImagesCount + count($files) > self::MAX_IMAGES_PER_TREATMENT) {
            throw ValidationException::withMessages([
                'image' => [__('api.treatments.max_images_reached', ['max' => self::MAX_IMAGES_PER_TREATMENT])],
            ]);
        }

        $expiresAt = now()->addMinutes(self::DIRECT_UPLOAD_TTL_MINUTES);
        $uploads = [];

        foreach ($files as $file) {
            $path = $this->buildStoragePath(
                dentistId: $dentistId,
                patientId: $patientId,
                treatmentId: (string) $treatment->id,
                extension: $this->resolveUploadExtension($file['filename'], $file['content_type'])
            );
            $uploadId = (string) Str::uuid();

            try {
                $temporaryUpload = Storage::disk($disk)->temporaryUploadUrl(
                    $path,
                    $expiresAt,
                    ['ContentType' => $file['content_type']]
                );
            } catch (RuntimeException) {
                return ['supported' => false];
            }

            Cache::put(
                $this->directUploadCacheKey($uploadId),
                [
                    'dentist_id' => $dentistId,
                    'patient_id' => $patientId,
                    'treatment_id' => (string) $treatment->id,
                    'disk' => $disk,
                    'path' => $path,
                    'mime_type' => $file['content_type'],
                    'file_size' => $file['file_size'],
                ],
                $expiresAt
            );

            $uploads[] = [
                'client_id' => $file['client_id'],
                'upload_id' => $uploadId,
                'method' => 'PUT',
                'url' => $temporaryUpload['url'],
                'headers' => $this->normalizeTemporaryUploadHeaders($temporaryUpload['headers'] ?? []),
            ];
        }

        return [
            'supported' => true,
            'uploads' => $uploads,
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }

    /**
     * @param list<string> $uploadIds
     * @return array{completed: list<TreatmentImage>, failed: list<array{upload_id: string, reason: string}>}
     */
    public function finalizeBatch(
        Treatment $treatment,
        int $dentistId,
        string $patientId,
        array $uploadIds
    ): array {
        $completed = [];
        $failed = [];
        $rows = [];
        $variantQueue = [];
        $now = now();
        $availableSlots = max(0, self::MAX_IMAGES_PER_TREATMENT - $treatment->images()->count());

        foreach ($uploadIds as $uploadId) {
            $ticket = Cache::pull($this->directUploadCacheKey($uploadId));
            if (! is_array($ticket)) {
                $failed[] = ['upload_id' => $uploadId, 'reason' => 'expired'];
                continue;
            }

            $disk = (string) ($ticket['disk'] ?? '');
            $path = (string) ($ticket['path'] ?? '');

            if (
                (int) ($ticket['dentist_id'] ?? 0) !== $dentistId
                || (string) ($ticket['patient_id'] ?? '') !== $patientId
                || (string) ($ticket['treatment_id'] ?? '') !== (string) $treatment->id
            ) {
                $this->deleteDirectUploadObject($disk, $path);
                $failed[] = ['upload_id' => $uploadId, 'reason' => 'invalid'];
                continue;
            }

            if (count($completed) >= $availableSlots) {
                $this->deleteDirectUploadObject($disk, $path);
                $failed[] = ['upload_id' => $uploadId, 'reason' => 'max_images'];
                continue;
            }

            if ($disk === '' || $path === '') {
                $failed[] = ['upload_id' => $uploadId, 'reason' => 'missing'];
                continue;
            }

            $storedSize = $this->resolveUploadedObjectSize($disk, $path, (int) ($ticket['file_size'] ?? 0));
            if ($storedSize <= 0) {
                $this->deleteDirectUploadObject($disk, $path);
                $failed[] = ['upload_id' => $uploadId, 'reason' => 'missing'];
                continue;
            }

            $attributes = [
                'id' => (string) Str::uuid(),
                'dentist_id' => $dentistId,
                'treatment_id' => (string) $treatment->id,
                'disk' => $disk,
                'path' => $path,
                'mime_type' => (string) ($ticket['mime_type'] ?? 'application/octet-stream'),
                'file_size' => $storedSize,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            $rows[] = $attributes;
            $variantQueue[] = [$disk, $path];
            $image = new TreatmentImage();
            $image->forceFill($attributes);
            $image->exists = true;
            $image->wasRecentlyCreated = true;
            $completed[] = $image;
        }

        if ($rows !== []) {
            TreatmentImage::query()->insert($rows);

            foreach ($variantQueue as [$disk, $path]) {
                $this->queueVariants((string) $disk, (string) $path);
            }
        }

        return [
            'completed' => $completed,
            'failed' => $failed,
        ];
    }

    public function queueVariants(string $disk, string $path): void
    {
        GenerateMediaVariants::dispatch(
            disk: $disk,
            sourcePath: $path,
            variants: $this->variantDefinitions($path),
            logContext: 'Treatment image',
            jpegQuality: self::JPEG_VARIANT_QUALITY,
            webpQuality: self::WEBP_VARIANT_QUALITY,
        )->afterResponse();
    }

    /**
     * @return list<string>
     */
    public function deletePaths(string $path): array
    {
        return [
            $path,
            $this->variantPath($path, self::IMAGE_VARIANT_THUMBNAIL),
            $this->variantPath($path, self::IMAGE_VARIANT_PREVIEW),
        ];
    }

    public function deleteStoredPaths(string $disk, array $paths, string $logContext = 'Treatment image'): void
    {
        if ($disk === '' || $paths === []) {
            return;
        }

        DeleteStoredMediaPaths::dispatch(
            disk: $disk,
            paths: array_values(array_unique($paths)),
            logContext: $logContext
        )->afterResponse();
    }

    private function mediaDisk(): string
    {
        return (string) config('filesystems.media_disk', 'local');
    }

    private function mediaDiskSupportsDirectUpload(string $disk): bool
    {
        return (string) config("filesystems.disks.{$disk}.driver") === 's3';
    }

    private function directUploadCacheKey(string $uploadId): string
    {
        return "treatment-image-upload:{$uploadId}";
    }

    private function buildStoragePath(
        int $dentistId,
        string $patientId,
        string $treatmentId,
        string $extension
    ): string {
        return sprintf(
            'treatments/%d/%s/%s/%s.%s',
            $dentistId,
            $patientId,
            $treatmentId,
            Str::uuid()->toString(),
            strtolower($extension)
        );
    }

    private function resolveUploadExtension(string $filename, string $contentType): string
    {
        $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));
        if ($extension !== '') {
            return $extension;
        }

        return match (strtolower($contentType)) {
            'image/jpeg', 'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };
    }

    /**
     * @return array<string, array{path: string, max_edge: int}>
     */
    private function variantDefinitions(string $path): array
    {
        $variants = [];

        foreach (self::IMAGE_VARIANT_MAX_EDGES as $variant => $maxEdge) {
            $variants[$variant] = [
                'path' => $this->variantPath($path, $variant),
                'max_edge' => $maxEdge,
            ];
        }

        return $variants;
    }

    private function variantPath(string $path, string $variant): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        return sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension);
    }

    /**
     * @param array<string, mixed> $headers
     * @return array<string, string>
     */
    private function normalizeTemporaryUploadHeaders(array $headers): array
    {
        $normalized = [];

        foreach ($headers as $name => $value) {
            if (strtolower((string) $name) === 'host') {
                continue;
            }

            if (is_array($value)) {
                $value = implode(', ', array_map(static fn (mixed $item): string => (string) $item, $value));
            }

            $normalized[(string) $name] = (string) $value;
        }

        return $normalized;
    }

    private function resolveUploadedObjectSize(string $disk, string $path, int $expectedSize): int
    {
        if (! (bool) config('filesystems.verify_direct_uploads_on_finalize', false)) {
            return $expectedSize;
        }

        try {
            return (int) Storage::disk($disk)->size($path);
        } catch (\Throwable) {
            return 0;
        }
    }

    private function deleteDirectUploadObject(string $disk, string $path): void
    {
        if ($disk === '' || $path === '') {
            return;
        }

        try {
            Storage::disk($disk)->delete($path);
            MediaPathCache::forgetPaths($disk, [$path]);
        } catch (\Throwable) {
            // Best effort cleanup. The uploaded object is orphaned, not user-facing.
        }
    }
}
