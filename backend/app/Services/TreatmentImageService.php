<?php

namespace App\Services;

use App\Jobs\DeleteStoredMediaPaths;
use App\Jobs\ProcessUploadedMedia;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use App\Support\ImageVariantGenerator;
use App\Support\MediaPathCache;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TreatmentImageService
{
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

    public function __construct(
        private readonly PlanLimitService $planLimitService,
    ) {}

    public function uploadQueued(
        int $dentistId,
        Patient $patient,
        Treatment $treatment,
        UploadedFile $uploadedFile,
        User $owner
    ): TreatmentImage {
        $this->planLimitService->ensureEntryImageUploadAllowed($owner, $treatment->images()->count());
        $this->planLimitService->ensureUploadFileAllowed(
            $owner,
            max((int) $uploadedFile->getSize(), 0),
            $uploadedFile->getMimeType() ?: $uploadedFile->getClientMimeType()
        );

        $disk = $this->mediaDisk();
        $mimeType = (string) ($uploadedFile->getMimeType() ?: $uploadedFile->getClientMimeType());
        $extension = $this->extensionForMimeType($mimeType);
        $directory = sprintf(
            'quarantine/treatments/%d/%s/%s',
            $dentistId,
            (string) $patient->id,
            (string) $treatment->id
        );
        $quarantinePath = sprintf('%s/%s.%s', $directory, Str::uuid()->toString(), $extension);
        $contents = file_get_contents((string) $uploadedFile->getRealPath());
        $stored = is_string($contents) && $contents !== ''
            ? Storage::disk($disk)->put($quarantinePath, $contents)
            : false;

        if (! $stored) {
            throw ValidationException::withMessages([
                'image' => [__('api.treatments.image_store_failed')],
            ]);
        }

        $image = $treatment->images()->create([
            'dentist_id' => $dentistId,
            'disk' => $disk,
            'path' => $quarantinePath,
            'mime_type' => $mimeType,
            'file_size' => max((int) Storage::disk($disk)->size($quarantinePath), 0),
            'scan_status' => 'pending',
            'quarantine_path' => $quarantinePath,
        ]);

        ProcessUploadedMedia::dispatch(TreatmentImage::class, (string) $image->id, (int) $owner->id);
        $image->refresh();
        if ((string) $image->scan_status === 'rejected') {
            throw ValidationException::withMessages([
                'image' => [__('api.treatments.image_store_failed')],
            ]);
        }

        return $image;
    }

    /**
     * @return array<string, int|string|null|bool>
     */
    public function payload(Treatment $treatment, TreatmentImage $image): array
    {
        $disk = trim((string) $image->disk) !== '' ? trim((string) $image->disk) : $this->mediaDisk();
        $originalPath = trim((string) $image->path);
        $isApproved = (string) $image->scan_status === 'approved';
        $thumbnailPath = $this->variantPath($originalPath, self::IMAGE_VARIANT_THUMBNAIL);
        $previewPath = $this->variantPath($originalPath, self::IMAGE_VARIANT_PREVIEW);

        $thumbnailReady = $isApproved && $this->mediaPathExists($disk, $thumbnailPath);
        $previewReady = $isApproved && $this->mediaPathExists($disk, $previewPath);

        return [
            'id' => (string) $image->id,
            'mime_type' => $image->mime_type,
            'file_size' => (int) $image->file_size,
            'scan_status' => (string) ($image->scan_status ?? 'approved'),
            'created_at' => $image->created_at?->toIso8601String(),
            'url' => $isApproved ? $this->url($treatment, $image) : null,
            'thumbnail_url' => $isApproved ? $this->url(
                $treatment,
                $image,
                self::IMAGE_VARIANT_THUMBNAIL,
                $thumbnailReady,
                $previewReady
            ) : null,
            'preview_url' => $isApproved ? $this->url(
                $treatment,
                $image,
                self::IMAGE_VARIANT_PREVIEW,
                $thumbnailReady,
                $previewReady
            ) : null,
            'thumbnail_ready' => $thumbnailReady,
            'preview_ready' => $previewReady,
        ];
    }

    public function findOwnedImage(Treatment $treatment, string $imageId): TreatmentImage
    {
        return TreatmentImage::query()
            ->where('id', $imageId)
            ->where('treatment_id', $treatment->id)
            ->where('dentist_id', $treatment->dentist_id)
            ->firstOrFail();
    }

    public function findApprovedImageForMedia(
        int $dentistId,
        string $patientId,
        string $treatmentId,
        string $imageId
    ): TreatmentImage {
        return TreatmentImage::query()
            ->where('id', $imageId)
            ->where('dentist_id', $dentistId)
            ->where('scan_status', 'approved')
            ->whereHas('treatment', function (Builder $query) use ($dentistId, $patientId, $treatmentId): void {
                $query
                    ->where('id', $treatmentId)
                    ->where('patient_id', $patientId)
                    ->where('dentist_id', $dentistId);
            })
            ->firstOrFail();
    }

    public function stream(Request $request, TreatmentImage $image): StreamedResponse
    {
        $disk = trim((string) $image->disk);
        $path = trim((string) $image->path);
        $variant = $request->query('variant');
        $variant = is_string($variant) && $variant !== '' ? $variant : null;

        if ($disk === '' || $path === '') {
            abort(404);
        }

        if ($variant !== null) {
            $variantResponse = $this->streamVariant($disk, $path, $variant);
            if ($variantResponse !== null) {
                return $variantResponse;
            }
        }

        if (! Storage::disk($disk)->exists($path)) {
            abort(404);
        }

        return $this->streamStored($disk, $path, $image->mime_type);
    }

    public function deleteFile(TreatmentImage $image): void
    {
        $disk = trim((string) $image->disk);
        $path = trim((string) $image->path);
        if ($disk === '' || $path === '') {
            return;
        }

        DeleteStoredMediaPaths::dispatch(
            disk: $disk,
            paths: $this->deletePaths($path),
            logContext: 'Treatment image'
        )->afterResponse();
        if (is_string($image->quarantine_path) && trim($image->quarantine_path) !== '') {
            DeleteStoredMediaPaths::dispatch(
                disk: $disk,
                paths: $this->deletePaths($image->quarantine_path),
                logContext: 'Treatment image'
            )->afterResponse();
        }
    }

    public function deleteAllForTreatment(Treatment $treatment): void
    {
        $images = $treatment->images()->get(['id', 'disk', 'path']);
        if ($images->isEmpty()) {
            return;
        }

        $pathsByDisk = [];
        $imageIds = [];

        foreach ($images as $image) {
            $imageIds[] = (string) $image->id;
            $disk = trim((string) $image->disk);
            $path = trim((string) $image->path);

            if ($disk === '' || $path === '') {
                continue;
            }

            $pathsByDisk[$disk] ??= [];
            array_push($pathsByDisk[$disk], ...$this->deletePaths($path));
        }

        foreach ($pathsByDisk as $disk => $paths) {
            DeleteStoredMediaPaths::dispatch(
                disk: $disk,
                paths: array_values(array_unique($paths)),
                logContext: 'Treatment image batch'
            )->afterResponse();
        }

        TreatmentImage::query()
            ->whereIn('id', $imageIds)
            ->delete();
    }

    private function url(
        Treatment $treatment,
        TreatmentImage $image,
        ?string $variant = null,
        ?bool $thumbnailReady = null,
        ?bool $previewReady = null
    ): ?string {
        $disk = trim((string) $image->disk) !== '' ? trim((string) $image->disk) : $this->mediaDisk();
        $path = trim((string) $image->path);

        $apiUrl = url(sprintf(
            '/api/v1/patients/%s/treatments/%s/images/%s',
            (string) $treatment->patient_id,
            (string) $treatment->id,
            (string) $image->id
        ));

        if ($variant === null) {
            $temporaryUrl = $this->temporaryUrl(
                $disk,
                $path,
                now()->addMinutes(10),
                $image->mime_type
            );

            return $temporaryUrl ?? $apiUrl;
        }

        if ($variant === self::IMAGE_VARIANT_THUMBNAIL) {
            $thumbnailReady ??= $this->mediaPathExists($disk, $this->variantPath($path, self::IMAGE_VARIANT_THUMBNAIL));
            $previewReady ??= $this->mediaPathExists($disk, $this->variantPath($path, self::IMAGE_VARIANT_PREVIEW));

            if ($thumbnailReady) {
                $thumbnailPath = $this->variantPath($path, self::IMAGE_VARIANT_THUMBNAIL);

                return $this->temporaryUrl($disk, $thumbnailPath, now()->addMinutes(10), $this->guessMimeType($thumbnailPath))
                    ?? ($apiUrl.'?variant='.self::IMAGE_VARIANT_THUMBNAIL);
            }

            if ($previewReady) {
                $previewPath = $this->variantPath($path, self::IMAGE_VARIANT_PREVIEW);

                return $this->temporaryUrl($disk, $previewPath, now()->addMinutes(10), $this->guessMimeType($previewPath))
                    ?? ($apiUrl.'?variant='.self::IMAGE_VARIANT_PREVIEW);
            }

            return $this->temporaryUrl($disk, $path, now()->addMinutes(10), $image->mime_type) ?? $apiUrl;
        }

        if ($variant === self::IMAGE_VARIANT_PREVIEW) {
            $previewReady ??= $this->mediaPathExists($disk, $this->variantPath($path, self::IMAGE_VARIANT_PREVIEW));

            if ($previewReady) {
                $previewPath = $this->variantPath($path, self::IMAGE_VARIANT_PREVIEW);

                return $this->temporaryUrl($disk, $previewPath, now()->addMinutes(10), $this->guessMimeType($previewPath))
                    ?? ($apiUrl.'?variant='.self::IMAGE_VARIANT_PREVIEW);
            }

            return $this->temporaryUrl($disk, $path, now()->addMinutes(10), $image->mime_type) ?? $apiUrl;
        }

        return $apiUrl.'?variant='.$variant;
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

    private function variantPath(string $path, string $variant): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        return sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension);
    }

    private function streamVariant(string $disk, string $path, string $variant): ?StreamedResponse
    {
        $variantPath = $this->resolvePath($path, $variant);
        if (Storage::disk($disk)->exists($variantPath)) {
            return $this->streamStored($disk, $variantPath, $this->guessMimeType($variantPath));
        }

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
            } catch (\Throwable $exception) {
                Log::warning('Treatment image variant persistence failed.', [
                    'exception' => $exception::class,
                    'variant' => $variant,
                ]);
            }

            return response()->stream(function () use ($generatedVariant): void {
                echo $generatedVariant['contents'];
            }, 200, [
                'Content-Type' => $generatedVariant['mime_type'],
                'Cache-Control' => $this->cacheControlHeader(),
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Treatment image variant streaming failed.', [
                'exception' => $exception::class,
                'variant' => $variant,
            ]);

            return null;
        }
    }

    private function streamStored(string $disk, string $path, ?string $fallbackMimeType = null): StreamedResponse
    {
        return Storage::disk($disk)->response(
            $path,
            basename($path),
            [
                'Content-Type' => $this->guessMimeType($path, $fallbackMimeType),
                'Cache-Control' => $this->cacheControlHeader(),
            ]
        );
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

    private function cacheControlHeader(): string
    {
        return 'private, max-age=31536000, immutable';
    }

    private function guessMimeType(string $path, ?string $fallbackMimeType = null): string
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

    private function mediaDisk(): string
    {
        return (string) config('filesystems.media_disk', 'local');
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

    private function temporaryUrl(
        string $disk,
        string $path,
        \DateTimeInterface $expiresAt,
        ?string $fallbackMimeType = null
    ): ?string {
        if ($disk === '' || $path === '' || ! $this->supportsDirectUpload($disk)) {
            return null;
        }

        try {
            return Storage::disk($disk)->temporaryUrl(
                $path,
                $expiresAt,
                [
                    'ResponseContentType' => $this->guessMimeType($path, $fallbackMimeType),
                ]
            );
        } catch (\Throwable) {
            return null;
        }
    }

    private function supportsDirectUpload(string $disk): bool
    {
        return (string) config("filesystems.disks.{$disk}.driver") === 's3';
    }
}
