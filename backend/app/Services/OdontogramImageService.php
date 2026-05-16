<?php

namespace App\Services;

use App\Jobs\DeleteStoredMediaPaths;
use App\Jobs\GenerateMediaVariants;
use App\Jobs\ProcessUploadedMedia;
use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\User;
use App\Support\ImageVariantGenerator;
use App\Support\MediaPathCache;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OdontogramImageService
{
    private const IMAGE_VARIANT_THUMBNAIL = 'thumbnail';

    private const IMAGE_VARIANT_PREVIEW = 'preview';

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

    /**
     * @param  array<string, mixed>  $validated
     */
    public function uploadQueued(
        int $dentistId,
        Patient $patient,
        OdontogramEntry $entry,
        array $validated,
        UploadedFile $uploadedFile,
        User $owner
    ): OdontogramEntryImage {
        $existingImage = $entry->images()
            ->where('stage', $validated['stage'])
            ->first();
        if (! $existingImage) {
            $this->planLimitService->ensureEntryImageUploadAllowed($owner, $entry->images()->count());
        }
        $this->planLimitService->ensureUploadFileAllowed(
            $owner,
            max((int) $uploadedFile->getSize(), 0),
            $uploadedFile->getMimeType() ?: $uploadedFile->getClientMimeType()
        );

        $mimeType = (string) ($uploadedFile->getMimeType() ?: $uploadedFile->getClientMimeType());
        $extension = $this->extensionForMimeType($mimeType);
        $directory = sprintf(
            'quarantine/odontogram/%d/%s/%s',
            $dentistId,
            (string) $patient->id,
            (string) $entry->id
        );
        $filename = sprintf('%s-%s.%s', $validated['stage'], Str::uuid()->toString(), $extension);
        $disk = $this->mediaDisk();
        $path = sprintf('%s/%s', $directory, $filename);
        $contents = file_get_contents((string) $uploadedFile->getRealPath());
        $stored = is_string($contents) && $contents !== ''
            ? Storage::disk($disk)->put($path, $contents)
            : false;

        if (! $stored) {
            throw ValidationException::withMessages([
                'image' => [__('api.odontogram.image_store_failed')],
            ]);
        }

        if ($existingImage) {
            $existingImage->update([
                'disk' => $disk,
                'path' => $path,
                'mime_type' => $mimeType,
                'file_size' => max((int) Storage::disk($disk)->size($path), 0),
                'captured_at' => $validated['captured_at'] ?? null,
                'scan_status' => 'pending',
                'scan_result' => null,
                'scan_provider' => null,
                'quarantine_path' => $path,
                'approved_at' => null,
                'scanned_at' => null,
                'rejected_at' => null,
            ]);
            $image = $existingImage;
        } else {
            $image = $entry->images()->create([
                'dentist_id' => $dentistId,
                'stage' => $validated['stage'],
                'disk' => $disk,
                'path' => $path,
                'mime_type' => $mimeType,
                'file_size' => max((int) Storage::disk($disk)->size($path), 0),
                'captured_at' => $validated['captured_at'] ?? null,
                'scan_status' => 'pending',
                'quarantine_path' => $path,
            ]);
        }

        ProcessUploadedMedia::dispatch(OdontogramEntryImage::class, (string) $image->id, (int) $owner->id);
        $image->refresh();
        if ((string) $image->scan_status === 'rejected') {
            throw ValidationException::withMessages([
                'image' => [__('api.odontogram.image_store_failed')],
            ]);
        }
        if ((string) $image->scan_status === 'approved') {
            $this->queueVariants((string) $image->disk, (string) $image->path);
        }

        return $image;
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function prepare(int $dentistId, string $patientId, OdontogramEntry $entry, User $owner, array $validated): array
    {
        $disk = $this->mediaDisk();
        if (! $this->mediaDiskSupportsDirectUpload($disk)) {
            return ['supported' => false];
        }

        $existingImage = $entry->images()
            ->where('stage', (string) $validated['stage'])
            ->first();
        if (! $existingImage) {
            $this->planLimitService->ensureEntryImageUploadAllowed($owner, $entry->images()->count());
        }
        $this->planLimitService->ensureUploadFileAllowed(
            $owner,
            (int) $validated['file_size'],
            (string) $validated['content_type']
        );
        $path = $this->buildStoragePath(
            dentistId: $dentistId,
            patientId: $patientId,
            entryId: (string) $entry->id,
            stage: (string) $validated['stage'],
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
                'patient_id' => $patientId,
                'entry_id' => (string) $entry->id,
                'stage' => (string) $validated['stage'],
                'captured_at' => $validated['captured_at'] ?? null,
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

    public function finalize(
        OdontogramEntry $entry,
        int $dentistId,
        string $patientId,
        User $owner,
        string $uploadId
    ): OdontogramEntryImage {
        $ticket = Cache::pull($this->directUploadCacheKey($uploadId));

        if (! is_array($ticket)) {
            throw ValidationException::withMessages([
                'image' => [$this->message(
                    'direct_upload_expired',
                    'The upload session expired. Please try uploading the image again.'
                )],
            ]);
        }

        if (
            (int) ($ticket['dentist_id'] ?? 0) !== $dentistId
            || (string) ($ticket['patient_id'] ?? '') !== $patientId
            || (string) ($ticket['entry_id'] ?? '') !== (string) $entry->id
        ) {
            throw ValidationException::withMessages([
                'image' => [$this->message(
                    'direct_upload_invalid',
                    'This upload does not belong to the selected odontogram record.'
                )],
            ]);
        }

        $disk = (string) ($ticket['disk'] ?? '');
        $path = (string) ($ticket['path'] ?? '');
        if ($disk === '' || $path === '') {
            throw ValidationException::withMessages([
                'image' => [$this->message(
                    'direct_upload_missing',
                    'The uploaded image could not be found in storage. Please retry the upload.'
                )],
            ]);
        }

        $existingImage = $entry->images()
            ->where('stage', (string) $ticket['stage'])
            ->first();
        try {
            if (! $existingImage) {
                $this->planLimitService->ensureEntryImageUploadAllowed($owner, $entry->images()->count());
            }
            $this->planLimitService->ensureUploadFileAllowed(
                $owner,
                (int) ($ticket['file_size'] ?? 0),
                (string) ($ticket['mime_type'] ?? '')
            );
            $storedSize = $this->resolveUploadedObjectSize($disk, $path, (int) ($ticket['file_size'] ?? 0));
        } catch (\Throwable $exception) {
            Storage::disk($disk)->delete($path);
            MediaPathCache::forgetPaths($disk, [$path]);

            throw $exception;
        }

        if ($existingImage) {
            $existingImage->update([
                'disk' => $disk,
                'path' => $path,
                'mime_type' => (string) ($ticket['mime_type'] ?? 'image/jpeg'),
                'file_size' => $storedSize,
                'captured_at' => $ticket['captured_at'] ?? null,
                'scan_status' => 'pending',
                'scan_result' => null,
                'scan_provider' => null,
                'quarantine_path' => $path,
                'approved_at' => null,
                'scanned_at' => null,
                'rejected_at' => null,
            ]);
            $image = $existingImage;
        } else {
            $image = $entry->images()->create([
                'dentist_id' => $dentistId,
                'stage' => (string) $ticket['stage'],
                'disk' => $disk,
                'path' => $path,
                'mime_type' => (string) ($ticket['mime_type'] ?? 'image/jpeg'),
                'file_size' => $storedSize,
                'captured_at' => $ticket['captured_at'] ?? null,
                'scan_status' => 'pending',
                'quarantine_path' => $path,
            ]);
        }

        ProcessUploadedMedia::dispatch(OdontogramEntryImage::class, (string) $image->id, (int) $owner->id);
        $image->refresh();
        if ((string) $image->scan_status === 'rejected') {
            throw ValidationException::withMessages([
                'image' => [$this->message(
                    'direct_upload_rejected',
                    'The uploaded image failed security checks.'
                )],
            ]);
        }

        if ((string) $image->scan_status === 'approved') {
            $this->queueVariants((string) $image->disk, (string) $image->path);
        }

        return $image;
    }

    public function findOwnedImage(OdontogramEntry $entry, string $imageId): OdontogramEntryImage
    {
        return $entry->images()
            ->where('id', $imageId)
            ->firstOrFail();
    }

    public function deleteFile(OdontogramEntryImage $image): void
    {
        $this->queueDeletion((string) $image->disk, (string) $image->path);
    }

    public function stream(OdontogramEntryImage $image, ?string $variant): StreamedResponse
    {
        if ((string) $image->scan_status !== 'approved') {
            abort(404);
        }

        if ($variant !== null) {
            $variantResponse = $this->streamVariant($image, $variant);
            if ($variantResponse !== null) {
                return $variantResponse;
            }
        }

        if (! Storage::disk($image->disk)->exists($image->path)) {
            abort(404);
        }

        return Storage::disk($image->disk)->response(
            $image->path,
            basename($image->path),
            [
                'Content-Type' => $image->mime_type,
                'Cache-Control' => 'private, max-age=31536000, immutable',
            ]
        );
    }

    public function buildUrl(
        OdontogramEntry $entry,
        OdontogramEntryImage $image,
        ?string $variant = null
    ): ?string {
        $disk = (string) $image->disk;
        $path = (string) $image->path;

        if ($variant !== null) {
            $variantPath = $this->variantPath($path, $variant);
            if (! $this->mediaPathExists($disk, $variantPath)) {
                if ($this->mediaDiskSupportsDirectUpload($disk)) {
                    return $this->temporaryUrl(
                        $disk,
                        $path,
                        now()->addMinutes(10),
                        (string) $image->mime_type
                    );
                }

                return url(sprintf(
                    '/api/v1/patients/%s/odontogram/%s/images/%s',
                    (string) $entry->patient_id,
                    (string) $entry->id,
                    (string) $image->id
                ));
            }

            $temporaryVariantUrl = $this->temporaryUrl(
                $disk,
                $variantPath,
                now()->addMinutes(10),
                (string) $image->mime_type
            );

            if ($temporaryVariantUrl !== null) {
                return $temporaryVariantUrl;
            }
        }

        if ($variant === null && $this->mediaDiskSupportsDirectUpload($disk)) {
            try {
                return Storage::disk($disk)->temporaryUrl(
                    $path,
                    now()->addMinutes(10),
                    [
                        'ResponseContentType' => (string) $image->mime_type,
                    ]
                );
            } catch (RuntimeException) {
                // Fallback to the protected route below.
            }
        }

        return url(sprintf(
            '/api/v1/patients/%s/odontogram/%s/images/%s',
            (string) $entry->patient_id,
            (string) $entry->id,
            (string) $image->id
        ).($variant !== null ? '?variant='.$variant : ''));
    }

    public function variantReady(OdontogramEntryImage $image, string $variant): bool
    {
        return $this->mediaPathExists(
            (string) $image->disk,
            $this->variantPath((string) $image->path, $variant)
        );
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
        return "odontogram-image-upload:{$uploadId}";
    }

    private function buildStoragePath(
        int $dentistId,
        string $patientId,
        string $entryId,
        string $stage,
        string $extension
    ): string {
        return sprintf(
            'quarantine/odontogram/%d/%s/%s/%s-%s.%s',
            $dentistId,
            $patientId,
            $entryId,
            $stage,
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

    private function temporaryUrl(
        string $disk,
        string $path,
        \DateTimeInterface $expiresAt,
        ?string $contentType = null
    ): ?string {
        if (! $this->mediaDiskSupportsDirectUpload($disk)) {
            return null;
        }

        try {
            return Storage::disk($disk)->temporaryUrl(
                $path,
                $expiresAt,
                $contentType !== null
                    ? ['ResponseContentType' => $contentType]
                    : []
            );
        } catch (RuntimeException) {
            return null;
        }
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

    private function variantPath(string $path, string $variant): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        return sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension);
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
            paths: [
                $path,
                $this->variantPath($path, self::IMAGE_VARIANT_THUMBNAIL),
                $this->variantPath($path, self::IMAGE_VARIANT_PREVIEW),
            ],
            logContext: 'Odontogram image'
        )->afterResponse();
    }

    private function queueVariants(string $disk, string $path): void
    {
        GenerateMediaVariants::dispatch(
            disk: $disk,
            sourcePath: $path,
            variants: [
                self::IMAGE_VARIANT_THUMBNAIL => [
                    'path' => $this->variantPath($path, self::IMAGE_VARIANT_THUMBNAIL),
                    'max_edge' => self::THUMBNAIL_MAX_EDGE,
                ],
                self::IMAGE_VARIANT_PREVIEW => [
                    'path' => $this->variantPath($path, self::IMAGE_VARIANT_PREVIEW),
                    'max_edge' => self::PREVIEW_MAX_EDGE,
                ],
            ],
            logContext: 'Odontogram image',
            jpegQuality: self::JPEG_VARIANT_QUALITY,
            webpQuality: self::WEBP_VARIANT_QUALITY,
        )->afterResponse();
    }

    private function resolveUploadedObjectSize(string $disk, string $path, int $expectedSize): int
    {
        if (! (bool) config('filesystems.verify_direct_uploads_on_finalize', false)) {
            return $expectedSize;
        }

        try {
            return max((int) Storage::disk($disk)->size($path), 0);
        } catch (\Throwable) {
            return 0;
        }
    }

    private function streamVariant(OdontogramEntryImage $image, string $variant): ?StreamedResponse
    {
        if (! array_key_exists($variant, self::IMAGE_VARIANT_MAX_EDGES)) {
            abort(404);
        }

        $disk = (string) $image->disk;
        $sourcePath = (string) $image->path;
        $variantPath = $this->variantPath($sourcePath, $variant);
        $storage = Storage::disk($disk);

        if ($storage->exists($variantPath)) {
            MediaPathCache::markPresent($disk, $variantPath);

            return $storage->response(
                $variantPath,
                basename($variantPath),
                [
                    'Content-Type' => (string) $image->mime_type,
                    'Cache-Control' => 'private, max-age=31536000, immutable',
                ]
            );
        }

        MediaPathCache::markMissing($disk, $variantPath);

        if (! $storage->exists($sourcePath)) {
            return null;
        }

        try {
            $generatedVariant = ImageVariantGenerator::make(
                $storage->get($sourcePath),
                $sourcePath,
                self::IMAGE_VARIANT_MAX_EDGES[$variant],
                self::JPEG_VARIANT_QUALITY,
                self::WEBP_VARIANT_QUALITY,
            );

            if ($generatedVariant === null) {
                return null;
            }

            try {
                $storage->put($variantPath, $generatedVariant['contents']);
                MediaPathCache::markPresent($disk, $variantPath);
            } catch (\Throwable $exception) {
                Log::warning('Odontogram image variant persistence failed.', [
                    'exception' => $exception::class,
                    'variant' => $variant,
                ]);
            }

            return response()->streamDownload(
                static function () use ($generatedVariant): void {
                    echo $generatedVariant['contents'];
                },
                basename($variantPath),
                [
                    'Content-Type' => $generatedVariant['mime_type'] ?? (string) $image->mime_type,
                    'Cache-Control' => 'private, max-age=31536000, immutable',
                ]
            );
        } catch (\Throwable $exception) {
            Log::warning('Odontogram image variant generation failed.', [
                'exception' => $exception::class,
                'variant' => $variant,
                'disk' => $disk,
                'source_path' => $sourcePath,
            ]);

            return null;
        }
    }

    private function message(string $key, string $fallback): string
    {
        $translationKey = "api.odontogram.{$key}";

        return Lang::has($translationKey) ? __($translationKey) : $fallback;
    }
}
