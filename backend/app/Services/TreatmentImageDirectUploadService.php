<?php

namespace App\Services;

use App\Jobs\DeleteStoredMediaPaths;
use App\Jobs\ProcessUploadedMedia;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class TreatmentImageDirectUploadService
{
    private const DIRECT_UPLOAD_TTL_MINUTES = 15;

    private const IMAGE_VARIANT_THUMBNAIL = 'thumbnail';

    private const IMAGE_VARIANT_PREVIEW = 'preview';

    public function __construct(
        private readonly ImageCompressionService $imageCompressionService,
        private readonly PlanLimitService $planLimitService,
    ) {}

    /**
     * @param  array{filename: string, content_type: string, file_size: int}  $file
     * @return array<string, mixed>
     */
    public function prepare(
        int $dentistId,
        string $patientId,
        Treatment $treatment,
        User $owner,
        array $file
    ): array {
        $this->planLimitService->ensureEntryImageUploadAllowed($owner, $treatment->images()->count());
        $this->planLimitService->ensureUploadFileAllowed(
            $owner,
            (int) $file['file_size'],
            (string) $file['content_type']
        );

        $disk = $this->mediaDisk();
        if (! $this->mediaDiskSupportsDirectUpload($disk)) {
            return ['supported' => false];
        }

        $expiresAt = now()->addMinutes(self::DIRECT_UPLOAD_TTL_MINUTES);
        $path = $this->buildStoragePath(
            dentistId: $dentistId,
            patientId: $patientId,
            treatmentId: (string) $treatment->id,
            extension: $this->resolveUploadExtension(
                (string) $file['filename'],
                (string) $file['content_type']
            )
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
                'mime_type' => (string) $file['content_type'],
                'file_size' => (int) $file['file_size'],
            ],
            $expiresAt
        );

        return [
            'supported' => true,
            'upload_id' => $uploadId,
            'method' => 'PUT',
            'url' => $temporaryUpload['url'],
            'headers' => $this->normalizeTemporaryUploadHeaders($temporaryUpload['headers'] ?? []),
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }

    public function finalize(
        Treatment $treatment,
        int $dentistId,
        string $patientId,
        User $owner,
        string $uploadId
    ): TreatmentImage {
        $ticket = Cache::pull($this->directUploadCacheKey($uploadId));

        if (! is_array($ticket)) {
            throw ValidationException::withMessages([
                'image' => [$this->treatmentMessage(
                    'direct_upload_expired',
                    'The upload session expired. Please try uploading the image again.'
                )],
            ]);
        }

        if (
            (int) ($ticket['dentist_id'] ?? 0) !== $dentistId
            || (string) ($ticket['patient_id'] ?? '') !== $patientId
            || (string) ($ticket['treatment_id'] ?? '') !== (string) $treatment->id
        ) {
            throw ValidationException::withMessages([
                'image' => [$this->treatmentMessage(
                    'direct_upload_invalid',
                    'This upload does not belong to the selected treatment entry.'
                )],
            ]);
        }

        $disk = (string) $ticket['disk'];
        $path = (string) $ticket['path'];

        try {
            $this->planLimitService->ensureEntryImageUploadAllowed($owner, $treatment->images()->count());
            $this->planLimitService->ensureUploadFileAllowed(
                $owner,
                (int) ($ticket['file_size'] ?? 0),
                (string) ($ticket['mime_type'] ?? '')
            );
        } catch (\Throwable $exception) {
            $this->deleteDirectUploadObject($disk, $path);

            throw $exception;
        }

        if (! Storage::disk($disk)->exists($path)) {
            throw ValidationException::withMessages([
                'image' => [$this->treatmentMessage(
                    'direct_upload_missing',
                    'The uploaded image could not be found in storage. Please retry the upload.'
                )],
            ]);
        }

        $storedSize = $this->resolveUploadedObjectSize($disk, $path, (int) ($ticket['file_size'] ?? 0));
        if ($storedSize <= 0) {
            $this->deleteDirectUploadObject($disk, $path);

            throw ValidationException::withMessages([
                'image' => [$this->treatmentMessage(
                    'direct_upload_missing',
                    'The uploaded image could not be found in storage. Please retry the upload.'
                )],
            ]);
        }

        $image = $treatment->images()->create([
            'dentist_id' => $dentistId,
            'disk' => $disk,
            'path' => $path,
            'mime_type' => (string) ($ticket['mime_type'] ?? 'image/jpeg'),
            'file_size' => $storedSize,
            'scan_status' => 'pending',
            'quarantine_path' => $path,
        ]);

        ProcessUploadedMedia::dispatch(TreatmentImage::class, (string) $image->id, (int) $owner->id);
        $image->refresh();
        if ((string) $image->scan_status === 'rejected') {
            throw ValidationException::withMessages([
                'image' => [$this->treatmentMessage(
                    'direct_upload_rejected',
                    'The uploaded image failed security checks.'
                )],
            ]);
        }

        return $image;
    }

    /**
     * @param  list<array{client_id: string, filename: string, content_type: string, file_size: int}>  $files
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

        $owner = User::query()->whereKey($dentistId)->firstOrFail();
        $this->planLimitService->ensureEntryImageUploadAllowed(
            $owner,
            $treatment->images()->count(),
            count($files)
        );

        $expiresAt = now()->addMinutes(self::DIRECT_UPLOAD_TTL_MINUTES);
        $uploads = [];

        foreach ($files as $file) {
            $this->planLimitService->ensureUploadFileAllowed(
                $owner,
                (int) $file['file_size'],
                (string) $file['content_type']
            );
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
     * @param  list<string>  $uploadIds
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
        $owner = User::query()->whereKey($dentistId)->firstOrFail();
        $availableSlots = $this->planLimitService->availableEntryImageSlots(
            $owner,
            $treatment->images()->count()
        );
        $availableSlots ??= count($uploadIds);
        $cacheKeysByUploadId = [];

        foreach ($uploadIds as $uploadId) {
            $cacheKeysByUploadId[$uploadId] = $this->directUploadCacheKey($uploadId);
        }

        $ticketsByCacheKey = Cache::many(array_values($cacheKeysByUploadId));

        foreach ($cacheKeysByUploadId as $cacheKey) {
            Cache::forget($cacheKey);
        }

        foreach ($uploadIds as $uploadId) {
            $ticket = $ticketsByCacheKey[$cacheKeysByUploadId[$uploadId]] ?? null;
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

            try {
                $this->planLimitService->ensureUploadFileAllowed(
                    $owner,
                    (int) ($ticket['file_size'] ?? $storedSize),
                    (string) ($ticket['mime_type'] ?? '')
                );
            } catch (\Throwable $exception) {
                $this->deleteDirectUploadObject($disk, $path);

                throw $exception;
            }

            $image = TreatmentImage::query()->create([
                'dentist_id' => $dentistId,
                'treatment_id' => (string) $treatment->id,
                'disk' => $disk,
                'path' => $path,
                'mime_type' => (string) ($ticket['mime_type'] ?? 'image/jpeg'),
                'file_size' => $storedSize,
                'scan_status' => 'pending',
                'quarantine_path' => $path,
            ]);

            ProcessUploadedMedia::dispatch(TreatmentImage::class, (string) $image->id, $owner->id);
            $image->refresh();
            $scanStatus = (string) $image->scan_status;

            if ($scanStatus === 'rejected') {
                $failed[] = ['upload_id' => $uploadId, 'reason' => 'security'];

                continue;
            }

            // Treat `pending` as completed too (matches singular finalize at
            // line ~197). With the production Redis queue, ProcessUploadedMedia
            // is async — the inline `refresh()` almost always sees `pending`.
            // Returning only `approved` rows silently dropped the new row out
            // of the response and the caller couldn't poll for it. Hand the
            // row back; the scan moves it to approved/rejected within seconds
            // and the worker queues variants once approval is persisted.
            $completed[] = $image;
        }

        return [
            'completed' => $completed,
            'failed' => $failed,
        ];
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
            'quarantine/treatments/%d/%s/%s/%s.%s',
            $dentistId,
            $patientId,
            $treatmentId,
            Str::uuid()->toString(),
            strtolower($extension)
        );
    }

    private function resolveUploadExtension(string $filename, string $contentType): string
    {
        unset($filename);

        return match (strtolower(trim($contentType))) {
            'image/jpeg', 'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };
    }

    private function variantPath(string $path, string $variant): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        return sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension);
    }

    /**
     * @param  array<string, mixed>  $headers
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

    private function treatmentMessage(string $key, string $fallback): string
    {
        $translationKey = "api.treatments.{$key}";

        return Lang::has($translationKey) ? __($translationKey) : $fallback;
    }
}
