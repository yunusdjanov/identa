<?php

namespace App\Services;

use App\Jobs\DeleteStoredMediaPaths;
use App\Models\Patient;
use App\Models\PatientClinicalPhoto;
use App\Support\MediaPathCache;
use App\Support\MediaVariantPaths;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientClinicalPhotoMediaService
{
    public const IMAGE_VARIANT_THUMBNAIL = 'thumbnail';

    public const IMAGE_VARIANT_PREVIEW = 'preview';

    /**
     * Stream the original or requested variant through the protected API route.
     */
    public function stream(PatientClinicalPhoto $photo, ?string $variant = null): StreamedResponse
    {
        if (! $this->isDisplayable($photo)) {
            abort(404);
        }
        if ($variant !== null && ! in_array($variant, [self::IMAGE_VARIANT_THUMBNAIL, self::IMAGE_VARIANT_PREVIEW], true)) {
            abort(404);
        }

        $disk = (string) ($photo->disk ?: $this->disk());
        $path = $variant !== null ? $this->variantPath((string) $photo->path, $variant) : (string) $photo->path;
        if (! Storage::disk($disk)->exists($path)) {
            $path = (string) $photo->path;
        }
        if (! Storage::disk($disk)->exists($path)) {
            abort(404);
        }

        return Storage::disk($disk)->response($path, basename($path), [
            'Content-Type' => (string) $photo->mime_type,
            'Cache-Control' => 'private, max-age=31536000, immutable',
        ]);
    }

    /**
     * Queue deletion for the source object and generated variants.
     */
    public function delete(PatientClinicalPhoto $photo): void
    {
        $disk = (string) ($photo->disk ?: $this->disk());
        $paths = array_values(array_unique(array_filter([
            trim((string) $photo->path),
            trim((string) $photo->quarantine_path),
        ])));

        foreach ($paths as $path) {
            DeleteStoredMediaPaths::dispatch(
                disk: $disk,
                paths: MediaVariantPaths::deletePaths($photo, $path),
                logContext: MediaVariantPaths::logContext($photo)
            )->afterResponse();
        }
    }

    /**
     * Build the API resource payload for the primary oral photo.
     *
     * @return array<string, mixed>|null
     */
    public function resourcePayload(Patient $patient, ?PatientClinicalPhoto $photo, Request $request): ?array
    {
        if ($photo === null) {
            return null;
        }

        return [
            'id' => (string) $photo->id,
            'view_type' => (string) $photo->view_type,
            'scan_status' => $this->displayScanStatus($photo),
            'url' => $this->url($patient, $photo, $request),
            'thumbnail_url' => $this->url($patient, $photo, $request, self::IMAGE_VARIANT_THUMBNAIL),
            'preview_url' => $this->url($patient, $photo, $request, self::IMAGE_VARIANT_PREVIEW),
            'thumbnail_ready' => $this->variantReady($photo, self::IMAGE_VARIANT_THUMBNAIL),
            'preview_ready' => $this->variantReady($photo, self::IMAGE_VARIANT_PREVIEW),
            'created_at' => $photo->created_at?->toIso8601String(),
            'updated_at' => $photo->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Build a protected or temporary URL for the oral photo.
     */
    public function url(Patient $patient, PatientClinicalPhoto $photo, Request $request, ?string $variant = null): ?string
    {
        if (! $this->isDisplayable($photo)) {
            return null;
        }

        $disk = (string) ($photo->disk ?: $this->disk());
        $path = (string) $photo->path;
        $selectedPath = $variant !== null ? $this->variantPath($path, $variant) : $path;
        if ($variant !== null && ! $this->mediaPathExists($disk, $selectedPath)) {
            $selectedPath = $path;
        }

        $temporaryUrl = $this->temporaryUrl($disk, $selectedPath, now()->addMinutes(10), (string) $photo->mime_type);
        if ($temporaryUrl !== null) {
            return $temporaryUrl;
        }

        $url = sprintf(
            '%s/api/v1/patients/%s/oral-photo?v=%s',
            $request->getSchemeAndHttpHost(),
            (string) $patient->id,
            (string) ($photo->updated_at?->getTimestamp() ?? 0)
        );

        return $variant !== null && $selectedPath !== $path ? $url.'&variant='.$variant : $url;
    }

    /**
     * Return whether a generated variant is ready for display.
     */
    public function variantReady(PatientClinicalPhoto $photo, string $variant): bool
    {
        return $this->isDisplayable($photo)
            && $this->mediaPathExists((string) ($photo->disk ?: $this->disk()), $this->variantPath((string) $photo->path, $variant));
    }

    /**
     * Return the scan status that should gate display URLs in API resources.
     */
    public function displayScanStatus(PatientClinicalPhoto $photo): string
    {
        $status = (string) ($photo->scan_status ?? 'approved');

        return $this->isDisplayable($photo) ? 'approved' : $status;
    }

    /**
     * Return true when an approved photo can be displayed, including retained replacements.
     */
    public function isDisplayable(PatientClinicalPhoto $photo): bool
    {
        $path = trim((string) $photo->path);
        if ($path === '') {
            return false;
        }
        if ((string) $photo->scan_status === 'approved') {
            return true;
        }

        $quarantinePath = trim((string) $photo->quarantine_path);

        return $quarantinePath !== '' && $path !== $quarantinePath;
    }

    /**
     * Return the configured media disk.
     */
    public function disk(): string
    {
        return (string) config('filesystems.media_disk', 'local');
    }

    private function temporaryUrl(string $disk, string $path, \DateTimeInterface $expiresAt, ?string $contentType): ?string
    {
        if ((string) config("filesystems.disks.{$disk}.driver") !== 's3') {
            return null;
        }
        try {
            return Storage::disk($disk)->temporaryUrl(
                $path,
                $expiresAt,
                $contentType !== null ? ['ResponseContentType' => $contentType] : []
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
        if (! (bool) config('filesystems.check_remote_variant_exists', false)
            && (string) config("filesystems.disks.{$disk}.driver") === 's3'
        ) {
            return false;
        }

        $exists = Storage::disk($disk)->exists($path);
        $exists ? MediaPathCache::markPresent($disk, $path) : MediaPathCache::markMissing($disk, $path);

        return $exists;
    }

    private function variantPath(string $path, string $variant): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        return sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension);
    }
}
