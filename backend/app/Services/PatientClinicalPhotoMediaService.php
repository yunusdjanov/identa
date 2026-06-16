<?php

namespace App\Services;

use App\Jobs\DeleteStoredMediaPaths;
use App\Models\Patient;
use App\Models\PatientClinicalPhoto;
use App\Support\MediaPathCache;
use App\Support\MediaVariantPaths;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
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
        $viewType = PatientClinicalPhoto::normalizeViewType((string) $photo->view_type) ?? (string) $photo->view_type;

        return [
            'id' => (string) $photo->id,
            'view_type' => $viewType,
            'scan_status' => $this->displayScanStatus($photo),
            'url' => $this->url($patient, $photo, $request),
            'thumbnail_url' => $this->url($patient, $photo, $request, self::IMAGE_VARIANT_THUMBNAIL),
            'preview_url' => $this->url($patient, $photo, $request, self::IMAGE_VARIANT_PREVIEW),
            'thumbnail_ready' => $this->variantReady($photo, self::IMAGE_VARIANT_THUMBNAIL),
            'preview_ready' => $this->variantReady($photo, self::IMAGE_VARIANT_PREVIEW),
            'is_primary' => (bool) $photo->is_primary,
            'sort_order' => (int) $photo->sort_order,
            'created_at' => $photo->created_at?->toIso8601String(),
            'updated_at' => $photo->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Build all oral-photo slot payloads keyed by slot name.
     *
     * @param  iterable<PatientClinicalPhoto>  $photos
     * @return array<string, array<string, mixed>|null>
     */
    public function resourceCollectionPayload(Patient $patient, iterable $photos, Request $request): array
    {
        $photosByViewType = [];
        foreach ($photos as $photo) {
            $viewType = PatientClinicalPhoto::normalizeViewType((string) $photo->view_type);
            if ($viewType === null) {
                continue;
            }

            $photosByViewType[$viewType][] = $photo;
        }

        $payload = [];
        foreach (PatientClinicalPhoto::VIEW_TYPES as $viewType) {
            $payload[$viewType] = $this->resourcePayload(
                $patient,
                $this->primaryPhoto($this->sortedPhotos($photosByViewType[$viewType] ?? [])),
                $request
            );
        }

        return $payload;
    }

    /**
     * Build gallery payloads keyed by oral-photo slot.
     *
     * @param  iterable<PatientClinicalPhoto>  $photos
     * @return array<string, list<array<string, mixed>>>
     */
    public function resourceGalleryPayload(Patient $patient, iterable $photos, Request $request): array
    {
        $photosByViewType = [];
        foreach ($photos as $photo) {
            $viewType = PatientClinicalPhoto::normalizeViewType((string) $photo->view_type);
            if ($viewType === null) {
                continue;
            }

            $photosByViewType[$viewType][] = $photo;
        }

        $payload = [];
        foreach (PatientClinicalPhoto::VIEW_TYPES as $viewType) {
            $payload[$viewType] = array_values(array_filter(array_map(
                fn (PatientClinicalPhoto $photo): ?array => $this->resourcePayload($patient, $photo, $request),
                $this->sortedPhotos($photosByViewType[$viewType] ?? [])
            )));
        }

        return $payload;
    }

    /**
     * Build a stable protected API URL for the oral photo.
     */
    public function url(Patient $patient, PatientClinicalPhoto $photo, Request $request, ?string $variant = null): ?string
    {
        if (! $this->isDisplayable($photo)) {
            return null;
        }

        $viewType = PatientClinicalPhoto::normalizeViewType((string) $photo->view_type) ?? (string) $photo->view_type;
        $url = sprintf(
            '%s/api/v1/patients/%s/oral-photos/%s/%s?v=%s',
            $request->getSchemeAndHttpHost(),
            (string) $patient->id,
            $viewType,
            (string) $photo->id,
            (string) ($photo->updated_at?->getTimestamp() ?? 0)
        );

        return $variant !== null ? $url.'&variant='.$variant : $url;
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

    /**
     * @param  list<PatientClinicalPhoto>  $photos
     * @return list<PatientClinicalPhoto>
     */
    private function sortedPhotos(array $photos): array
    {
        usort($photos, static function (PatientClinicalPhoto $left, PatientClinicalPhoto $right): int {
            return [
                (bool) $left->is_primary ? 0 : 1,
                (string) $left->view_type === PatientClinicalPhoto::VIEW_TYPE_SMILE ? 0 : 1,
                (int) $left->sort_order,
                (int) ($left->created_at?->getTimestamp() ?? 0),
                (string) $left->id,
            ] <=> [
                (bool) $right->is_primary ? 0 : 1,
                (string) $right->view_type === PatientClinicalPhoto::VIEW_TYPE_SMILE ? 0 : 1,
                (int) $right->sort_order,
                (int) ($right->created_at?->getTimestamp() ?? 0),
                (string) $right->id,
            ];
        });

        return $photos;
    }

    /**
     * @param  list<PatientClinicalPhoto>  $photos
     */
    private function primaryPhoto(array $photos): ?PatientClinicalPhoto
    {
        return $photos[0] ?? null;
    }
}
