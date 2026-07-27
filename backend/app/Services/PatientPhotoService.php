<?php

namespace App\Services;

use App\Jobs\DeleteStoredMediaPaths;
use App\Jobs\ProcessUploadedMedia;
use App\Models\Patient;
use App\Models\User;
use App\Support\ImageVariantGenerator;
use App\Support\MediaPathCache;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientPhotoService
{
    public const IMAGE_VARIANT_THUMBNAIL = 'thumbnail';

    public const IMAGE_VARIANT_PREVIEW = 'preview';

    private const THUMBNAIL_MAX_EDGE = 160;

    private const PREVIEW_MAX_EDGE = 960;

    private const JPEG_VARIANT_QUALITY = 82;

    private const WEBP_VARIANT_QUALITY = 80;

    private const DIRECT_UPLOAD_TTL_MINUTES = 15;

    /**
     * @var array<string, int>
     */
    private const IMAGE_VARIANT_MAX_EDGES = [
        self::IMAGE_VARIANT_THUMBNAIL => self::THUMBNAIL_MAX_EDGE,
        self::IMAGE_VARIANT_PREVIEW => self::PREVIEW_MAX_EDGE,
    ];

    public function __construct(
        private readonly PlanLimitService $planLimitService,
    ) {}

    public function uploadQueued(Patient $patient, UploadedFile $uploadedPhoto, User $owner): Patient
    {
        $this->planLimitService->ensureUploadFileAllowed(
            $owner,
            max((int) $uploadedPhoto->getSize(), 0),
            $uploadedPhoto->getMimeType() ?: $uploadedPhoto->getClientMimeType()
        );

        $disk = $this->disk();
        $mimeType = (string) ($uploadedPhoto->getMimeType() ?: $uploadedPhoto->getClientMimeType());
        $extension = $this->extensionForMimeType($mimeType);
        $directory = sprintf('quarantine/patients/%s/%s', $patient->dentist_id, $patient->id);
        $quarantinePath = sprintf('%s/%s.%s', $directory, Str::uuid()->toString(), $extension);
        $contents = file_get_contents((string) $uploadedPhoto->getRealPath());
        $stored = is_string($contents) && $contents !== ''
            ? Storage::disk($disk)->put($quarantinePath, $contents)
            : false;

        if (! $stored) {
            throw ValidationException::withMessages([
                'photo' => [__('api.patients.photo_store_failed')],
            ]);
        }

        $hasRetainedPhoto = is_string($patient->photo_path) && trim($patient->photo_path) !== '';

        $attributes = [
            'photo_disk' => $disk,
            'scan_status' => 'pending',
            'scan_result' => null,
            'scan_provider' => null,
            'quarantine_path' => $quarantinePath,
            'scanned_at' => null,
            'rejected_at' => null,
        ];
        if (! $hasRetainedPhoto) {
            $attributes['approved_at'] = null;
        }

        $patient->forceFill($attributes)->save();

        ProcessUploadedMedia::dispatch(Patient::class, (string) $patient->id, (int) $owner->id);
        $patient->refresh();

        if ((string) $patient->scan_status === 'rejected') {
            throw ValidationException::withMessages([
                'photo' => [__('api.patients.photo_store_failed')],
            ]);
        }

        return $patient;
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function prepare(int $dentistId, Patient $patient, User $owner, array $validated): array
    {
        $disk = $this->disk();
        if (! $this->mediaDiskSupportsDirectUpload($disk)) {
            return ['supported' => false];
        }

        $this->planLimitService->ensureUploadFileAllowed(
            $owner,
            (int) $validated['file_size'],
            (string) $validated['content_type']
        );
        $path = $this->buildStoragePath(
            dentistId: $dentistId,
            patientId: (string) $patient->id,
            extension: $this->resolveUploadExtension(
                filename: (string) $validated['filename'],
                contentType: (string) $validated['content_type'],
            ),
        );
        $uploadId = (string) Str::uuid();
        $expiresAt = now()->addMinutes(self::DIRECT_UPLOAD_TTL_MINUTES);

        try {
            $temporaryUpload = Storage::disk($disk)->temporaryUploadUrl(
                $path,
                $expiresAt,
                [
                    'ContentType' => $validated['content_type'],
                ]
            );
        } catch (RuntimeException) {
            return ['supported' => false];
        }

        Cache::put(
            $this->directUploadCacheKey($uploadId),
            [
                'dentist_id' => $dentistId,
                'patient_id' => (string) $patient->id,
                'disk' => $disk,
                'path' => $path,
                'mime_type' => (string) $validated['content_type'],
                'file_size' => (int) $validated['file_size'],
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

    public function finalize(Patient $patient, int $dentistId, User $owner, string $uploadId): Patient
    {
        $ticket = Cache::pull($this->directUploadCacheKey($uploadId));

        if (! is_array($ticket)) {
            throw ValidationException::withMessages([
                'photo' => [$this->message(
                    'direct_upload_expired',
                    'The upload session expired. Please try uploading the patient photo again.'
                )],
            ]);
        }

        if (
            (int) ($ticket['dentist_id'] ?? 0) !== $dentistId
            || (string) ($ticket['patient_id'] ?? '') !== (string) $patient->id
        ) {
            throw ValidationException::withMessages([
                'photo' => [$this->message(
                    'direct_upload_invalid',
                    'This upload does not belong to the selected patient.'
                )],
            ]);
        }

        $disk = (string) ($ticket['disk'] ?? '');
        $path = (string) ($ticket['path'] ?? '');

        if ($disk === '' || $path === '') {
            throw ValidationException::withMessages([
                'photo' => [$this->message(
                    'direct_upload_missing',
                    'The uploaded patient photo could not be found in storage. Please retry the upload.'
                )],
            ]);
        }

        $storedSize = $this->resolveUploadedObjectSize($disk, $path, (int) ($ticket['file_size'] ?? 0));
        if ($storedSize <= 0) {
            Storage::disk($disk)->delete($path);
            MediaPathCache::forgetPaths($disk, [$path]);

            throw ValidationException::withMessages([
                'photo' => [$this->message(
                    'direct_upload_missing',
                    'The uploaded patient photo could not be found in storage. Please retry the upload.'
                )],
            ]);
        }

        try {
            $this->planLimitService->ensureUploadFileAllowed(
                $owner,
                $storedSize,
                (string) ($ticket['mime_type'] ?? '')
            );
        } catch (\Throwable $exception) {
            Storage::disk($disk)->delete($path);
            MediaPathCache::forgetPaths($disk, [$path]);

            throw $exception;
        }

        $hasRetainedPhoto = is_string($patient->photo_path) && trim($patient->photo_path) !== '';

        $attributes = [
            'photo_disk' => $disk,
            'scan_status' => 'pending',
            'scan_result' => null,
            'scan_provider' => null,
            'quarantine_path' => $path,
            'scanned_at' => null,
            'rejected_at' => null,
        ];
        if (! $hasRetainedPhoto) {
            $attributes['approved_at'] = null;
        }

        $patient->forceFill($attributes)->save();

        ProcessUploadedMedia::dispatch(Patient::class, (string) $patient->id, (int) $owner->id);
        $patient->refresh();

        if ((string) $patient->scan_status === 'rejected') {
            throw ValidationException::withMessages([
                'photo' => [$this->message(
                    'direct_upload_rejected',
                    'The uploaded patient photo failed security checks.'
                )],
            ]);
        }

        return $patient;
    }

    public function stream(Request $request, Patient $patient): StreamedResponse
    {
        $photoPath = trim((string) $patient->photo_path);
        if (! $this->isDisplayable($patient)) {
            abort(404);
        }

        $disk = is_string($patient->photo_disk) && $patient->photo_disk !== ''
            ? $patient->photo_disk
            : $this->disk();
        $variant = $request->query('variant');
        $variant = is_string($variant) && $variant !== '' ? $variant : null;

        if ($variant !== null) {
            $variantResponse = $this->streamVariant($disk, $photoPath, $variant);
            if ($variantResponse !== null) {
                return $variantResponse;
            }
        }

        if (! Storage::disk($disk)->exists($photoPath)) {
            abort(404);
        }

        return $this->streamStored($disk, $photoPath);
    }

    public function delete(Patient $patient): void
    {
        $photoPath = is_string($patient->photo_path) ? trim($patient->photo_path) : '';
        $quarantinePath = is_string($patient->quarantine_path) ? trim($patient->quarantine_path) : '';
        if ($photoPath === '' && $quarantinePath === '') {
            return;
        }

        $disk = is_string($patient->photo_disk) && $patient->photo_disk !== ''
            ? $patient->photo_disk
            : $this->disk();
        if ($photoPath !== '') {
            $this->queueDeletion($disk, $photoPath);
        }
        if ($quarantinePath !== '') {
            $this->queueDeletion($disk, $quarantinePath);
        }
    }

    public function url(Patient $patient, ?Request $request = null, ?string $variant = null): ?string
    {
        if (
            ! is_string($patient->photo_path)
            || $patient->photo_path === ''
            || ! $this->isDisplayable($patient)
        ) {
            return null;
        }

        $baseUrl = $request !== null
            ? $request->getSchemeAndHttpHost()
            : rtrim((string) config('app.url'), '/');
        $version = (string) ($patient->updated_at?->getTimestamp() ?? 0);
        $url = sprintf('%s/api/v1/patients/%s/photo?v=%s', $baseUrl, $patient->id, $version);

        if ($variant === null) {
            return $url;
        }

        return $url.'&variant='.$variant;
    }

    public function variantReady(string $disk, Patient $patient, string $variant): bool
    {
        if (
            ! is_string($patient->photo_path)
            || $patient->photo_path === ''
            || ! $this->isDisplayable($patient)
        ) {
            return false;
        }

        return $this->mediaPathExists($disk, $this->variantPath($patient->photo_path, $variant));
    }

    /**
     * Return the scan status that should gate display URLs in API resources.
     */
    public function displayScanStatus(Patient $patient): string
    {
        $status = (string) ($patient->scan_status ?? 'approved');

        return $this->isDisplayable($patient) ? 'approved' : $status;
    }

    public function disk(): string
    {
        return (string) config('filesystems.media_disk', 'local');
    }

    public function variantPath(string $path, string $variant): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        return sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension);
    }

    private function mediaDiskSupportsDirectUpload(string $disk): bool
    {
        // Direct-upload is an S3 feature. Other adapters (local, gcs without
        // signed-url credentials) either silently return a non-functional URL
        // (Laravel's `Storage::fake('local')` does this) or throw at signing
        // time — neither is useful to a browser uploader. Match the explicit
        // `=== 's3'` check used by the treatment image direct-upload service
        // so this stays consistent across the codebase and the fallback
        // branch is reachable in tests.
        return (string) config("filesystems.disks.{$disk}.driver") === 's3';
    }

    private function isDisplayable(Patient $patient): bool
    {
        $photoPath = trim((string) $patient->photo_path);
        if ($photoPath === '') {
            return false;
        }

        if ((string) $patient->scan_status === 'approved') {
            return true;
        }

        $quarantinePath = trim((string) $patient->quarantine_path);

        return $quarantinePath !== '' && $photoPath !== $quarantinePath;
    }

    private function resolveUploadedObjectSize(string $disk, string $path, int $expectedSize): int
    {
        if (! (bool) config('filesystems.verify_direct_uploads_on_finalize', true)) {
            return max($expectedSize, 0);
        }

        try {
            return max((int) Storage::disk($disk)->size($path), 0);
        } catch (\Throwable) {
            return 0;
        }
    }

    private function directUploadCacheKey(string $uploadId): string
    {
        return "patient-photo-upload:{$uploadId}";
    }

    private function buildStoragePath(int $dentistId, string $patientId, string $extension): string
    {
        return sprintf(
            'quarantine/patients/%d/%s/photos/%s.%s',
            $dentistId,
            $patientId,
            Str::uuid()->toString(),
            strtolower($extension)
        );
    }

    private function resolveUploadExtension(string $filename, string $contentType): string
    {
        unset($filename);

        return $this->extensionForMimeType($contentType);
    }

    private function extensionForMimeType(string $contentType): string
    {
        return match (strtolower(trim($contentType))) {
            'image/jpeg', 'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };
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

    private function mediaPathExists(string $disk, string $path): bool
    {
        $cached = MediaPathCache::get($disk, $path);
        if ($cached !== null) {
            return $cached;
        }

        if ($this->shouldSkipRemoteMediaPathLookup($disk)) {
            return false;
        }

        $exists = Storage::disk($disk)->exists($path);

        if ($exists) {
            MediaPathCache::markPresent($disk, $path);
        } else {
            MediaPathCache::markMissing($disk, $path);
        }

        return $exists;
    }

    private function shouldSkipRemoteMediaPathLookup(string $disk): bool
    {
        return ! (bool) config('filesystems.check_remote_variant_exists', false)
            && (string) config("filesystems.disks.{$disk}.driver") === 's3';
    }

    private function message(string $key, string $fallback): string
    {
        $translationKey = "api.patients.{$key}";

        return Lang::has($translationKey) ? __($translationKey) : $fallback;
    }

    /**
     * @return list<string>
     */
    private function deletePaths(string $path): array
    {
        return [
            $path,
            $this->variantPath($path, self::IMAGE_VARIANT_THUMBNAIL),
            $this->variantPath($path, self::IMAGE_VARIANT_PREVIEW),
        ];
    }

    private function queueDeletion(string $disk, string $path): void
    {
        $disk = trim($disk);
        $path = trim($path);

        if ($disk === '' || $path === '') {
            return;
        }

        DeleteStoredMediaPaths::dispatch(
            disk: $disk,
            paths: $this->deletePaths($path),
            logContext: 'Patient photo'
        )->afterResponse();
    }

    private function resolvePath(string $path, ?string $variant): string
    {
        if ($variant === null) {
            return $path;
        }

        if (! array_key_exists($variant, self::IMAGE_VARIANT_MAX_EDGES)) {
            abort(404);
        }

        return $this->variantPath($path, $variant);
    }

    private function streamVariant(string $disk, string $path, string $variant): ?StreamedResponse
    {
        $variantPath = $this->resolvePath($path, $variant);
        if (Storage::disk($disk)->exists($variantPath)) {
            MediaPathCache::markPresent($disk, $variantPath);

            return $this->streamStored($disk, $variantPath);
        }

        MediaPathCache::markMissing($disk, $variantPath);

        if (! Storage::disk($disk)->exists($path)) {
            return null;
        }

        try {
            $generatedVariant = ImageVariantGenerator::make(
                Storage::disk($disk)->get($path),
                $path,
                self::IMAGE_VARIANT_MAX_EDGES[$variant],
                self::JPEG_VARIANT_QUALITY,
                self::WEBP_VARIANT_QUALITY,
            );

            if ($generatedVariant === null) {
                return null;
            }

            try {
                Storage::disk($disk)->put($variantPath, $generatedVariant['contents']);
                MediaPathCache::markPresent($disk, $variantPath);
            } catch (\Throwable $exception) {
                Log::warning('Patient photo variant persistence failed.', [
                    'exception' => $exception::class,
                    'variant' => $variant,
                ]);
            }

            return response()->stream(function () use ($generatedVariant): void {
                echo $generatedVariant['contents'];
            }, 200, [
                'Content-Type' => $generatedVariant['mime_type'],
                'Cache-Control' => $this->imageCacheControlHeader(),
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Patient photo variant streaming failed.', [
                'exception' => $exception::class,
                'variant' => $variant,
            ]);

            return null;
        }
    }

    private function streamStored(string $disk, string $path): StreamedResponse
    {
        return Storage::disk($disk)->response(
            $path,
            basename($path),
            [
                'Content-Type' => $this->guessImageMimeType($path),
                'Cache-Control' => $this->imageCacheControlHeader(),
            ]
        );
    }

    private function imageCacheControlHeader(): string
    {
        return 'private, max-age=31536000, immutable';
    }

    private function guessImageMimeType(string $path, ?string $fallbackMimeType = null): string
    {
        $extension = strtolower((string) pathinfo($path, PATHINFO_EXTENSION));

        return match ($extension) {
            'jpg', 'jpeg' => 'image/jpeg',
            'png' => 'image/png',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            default => $fallbackMimeType ?: 'application/octet-stream',
        };
    }
}
