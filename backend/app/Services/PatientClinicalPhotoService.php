<?php

namespace App\Services;

use App\Jobs\ProcessUploadedMedia;
use App\Models\Patient;
use App\Models\PatientClinicalPhoto;
use App\Models\User;
use App\Support\MediaPathCache;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientClinicalPhotoService
{
    private const DIRECT_UPLOAD_TTL_MINUTES = 15;
    public function __construct(
        private readonly PlanLimitService $planLimitService,
        private readonly PatientClinicalPhotoMediaService $media,
    ) {}

    /** Store or replace one of the patient's oral photo slots through the API upload path. */
    public function uploadPrimaryOralQueued(
        Patient $patient,
        UploadedFile $uploadedPhoto,
        User $owner,
        string $viewType = PatientClinicalPhoto::VIEW_TYPE_SMILE
    ): PatientClinicalPhoto {
        $viewType = $this->normalizeViewType($viewType);
        $this->planLimitService->ensureUploadFileAllowed(
            $owner,
            max((int) $uploadedPhoto->getSize(), 0),
            $uploadedPhoto->getMimeType() ?: $uploadedPhoto->getClientMimeType()
        );

        $disk = $this->disk();
        $mimeType = (string) ($uploadedPhoto->getMimeType() ?: $uploadedPhoto->getClientMimeType());
        $path = $this->buildStoragePath((int) $patient->dentist_id, (string) $patient->id, $viewType, $this->extensionForMimeType($mimeType));
        $contents = file_get_contents((string) $uploadedPhoto->getRealPath());
        $stored = is_string($contents) && $contents !== '' ? Storage::disk($disk)->put($path, $contents) : false;

        if (! $stored) {
            throw ValidationException::withMessages(['photo' => [__('api.patients.photo_store_failed')]]);
        }

        return $this->queueScanOrFail($this->startPendingReplacement(
            patient: $patient,
            viewType: $viewType,
            disk: $disk,
            path: $path,
            mimeType: $mimeType,
            fileSize: max((int) Storage::disk($disk)->size($path), 0),
        ), $owner, __('api.patients.photo_store_failed'));
    }

    /**
     * Prepare a signed direct-upload ticket for the primary oral photo.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function preparePrimaryOral(
        int $dentistId,
        Patient $patient,
        User $owner,
        array $validated,
        string $viewType = PatientClinicalPhoto::VIEW_TYPE_SMILE
    ): array {
        $viewType = $this->normalizeViewType($viewType);
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
            $dentistId,
            (string) $patient->id,
            $viewType,
            $this->extensionForMimeType((string) $validated['content_type'])
        );
        $uploadId = (string) Str::uuid();
        $expiresAt = now()->addMinutes(self::DIRECT_UPLOAD_TTL_MINUTES);

        try {
            $temporaryUpload = Storage::disk($disk)->temporaryUploadUrl(
                $path,
                $expiresAt,
                ['ContentType' => $validated['content_type']]
            );
        } catch (RuntimeException) {
            return ['supported' => false];
        }

        Cache::put($this->directUploadCacheKey($uploadId), [
            'dentist_id' => $dentistId,
            'patient_id' => (string) $patient->id,
            'view_type' => $viewType,
            'disk' => $disk,
            'path' => $path,
            'mime_type' => (string) $validated['content_type'],
            'file_size' => (int) $validated['file_size'],
        ], $expiresAt);

        return [
            'supported' => true,
            'upload_id' => $uploadId,
            'method' => 'PUT',
            'url' => $temporaryUpload['url'],
            'headers' => $this->normalizeTemporaryUploadHeaders($temporaryUpload['headers'] ?? []),
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }

    /** Finalize a direct upload and queue media scanning for the primary oral photo. */
    public function finalizePrimaryOral(
        Patient $patient,
        int $dentistId,
        User $owner,
        string $uploadId,
        string $viewType = PatientClinicalPhoto::VIEW_TYPE_SMILE
    ): PatientClinicalPhoto {
        $viewType = $this->normalizeViewType($viewType);
        $ticket = Cache::pull($this->directUploadCacheKey($uploadId));
        if (! is_array($ticket)) {
            throw ValidationException::withMessages(['photo' => [$this->message('direct_upload_expired', 'The upload session expired. Please try uploading the oral photo again.')]]);
        }
        $this->assertTicketBelongsToPatient($ticket, $dentistId, (string) $patient->id, $viewType);

        $disk = (string) ($ticket['disk'] ?? '');
        $path = (string) ($ticket['path'] ?? '');
        if ($disk === '' || $path === '') {
            throw ValidationException::withMessages(['photo' => [$this->message('direct_upload_missing', 'The uploaded oral photo could not be found in storage. Please retry the upload.')]]);
        }

        $storedSize = $this->resolveUploadedObjectSize($disk, $path, (int) ($ticket['file_size'] ?? 0));
        try {
            $this->planLimitService->ensureUploadFileAllowed(
                $owner,
                (int) ($ticket['file_size'] ?? $storedSize),
                (string) ($ticket['mime_type'] ?? '')
            );
        } catch (\Throwable $exception) {
            Storage::disk($disk)->delete($path);
            MediaPathCache::forgetPaths($disk, [$path]);
            throw $exception;
        }

        return $this->queueScanOrFail($this->startPendingReplacement(
            patient: $patient,
            viewType: $viewType,
            disk: $disk,
            path: $path,
            mimeType: (string) ($ticket['mime_type'] ?? 'image/jpeg'),
            fileSize: $storedSize,
        ), $owner, $this->message('direct_upload_rejected', 'The uploaded oral photo failed security checks.'));
    }

    /** Return one of the patient's oral photo slots or abort with 404. */
    public function oralPhotoOrFail(Patient $patient, string $viewType = PatientClinicalPhoto::VIEW_TYPE_SMILE): PatientClinicalPhoto
    {
        $viewType = $this->normalizeViewType($viewType);
        $query = $patient->oralPhotos();
        if ($viewType === PatientClinicalPhoto::VIEW_TYPE_SMILE) {
            return $query
                ->whereIn('view_type', [
                    PatientClinicalPhoto::VIEW_TYPE_SMILE,
                    PatientClinicalPhoto::VIEW_TYPE_LEGACY_ORAL_PRIMARY,
                ])
                ->orderByRaw(
                    'case when view_type = ? then 0 else 1 end',
                    [PatientClinicalPhoto::VIEW_TYPE_SMILE]
                )
                ->firstOrFail();
        }

        return $query->where('view_type', $viewType)->firstOrFail();
    }

    /** Stream the original or requested variant through the protected API route. */
    public function stream(PatientClinicalPhoto $photo, ?string $variant = null): StreamedResponse
    {
        return $this->media->stream($photo, $variant);
    }

    /** Queue deletion for the source object and generated variants. */
    public function delete(PatientClinicalPhoto $photo): void
    {
        $this->media->delete($photo);
    }

    /**
     * Build the API resource payload for the primary oral photo.
     *
     * @return array<string, mixed>|null
     */
    public function resourcePayload(Patient $patient, ?PatientClinicalPhoto $photo, Request $request): ?array
    {
        return $this->media->resourcePayload($patient, $photo, $request);
    }

    /**
     * Build all oral-photo slot payloads keyed by slot name.
     *
     * @param  iterable<PatientClinicalPhoto>  $photos
     * @return array<string, array<string, mixed>|null>
     */
    public function resourceCollectionPayload(Patient $patient, iterable $photos, Request $request): array
    {
        return $this->media->resourceCollectionPayload($patient, $photos, $request);
    }

    /** Return the configured media disk. */
    public function disk(): string
    {
        return $this->media->disk();
    }

    /** Normalize and validate an oral photo slot name. */
    public function normalizeViewType(?string $viewType): string
    {
        $normalized = PatientClinicalPhoto::normalizeViewType($viewType);
        if ($normalized !== null) {
            return $normalized;
        }

        throw ValidationException::withMessages([
            'view_type' => ['Allowed oral photo slots are smile, top, and bottom.'],
        ]);
    }

    private function queueScanOrFail(PatientClinicalPhoto $photo, User $owner, string $message): PatientClinicalPhoto
    {
        ProcessUploadedMedia::dispatchSync(PatientClinicalPhoto::class, (string) $photo->id, (int) $owner->id);
        $photo->refresh();
        if ((string) $photo->scan_status === 'rejected') {
            throw ValidationException::withMessages(['photo' => [$message]]);
        }

        return $photo;
    }

    private function startPendingReplacement(
        Patient $patient,
        string $viewType,
        string $disk,
        string $path,
        string $mimeType,
        int $fileSize
    ): PatientClinicalPhoto
    {
        $photo = PatientClinicalPhoto::query()->firstOrNew([
            'patient_id' => (string) $patient->id,
            'view_type' => $viewType,
        ]);
        $attributes = [
            'dentist_id' => (int) $patient->dentist_id,
            'is_primary' => true,
            'sort_order' => 0,
            'disk' => $disk,
            'mime_type' => $mimeType,
            'file_size' => $fileSize,
            'scan_status' => 'pending',
            'scan_result' => null,
            'scan_provider' => null,
            'quarantine_path' => $path,
            'scanned_at' => null,
            'rejected_at' => null,
        ];
        if (! ($photo->exists && $this->media->isDisplayable($photo))) {
            $attributes['path'] = $path;
            $attributes['approved_at'] = null;
        }

        $photo->forceFill($attributes)->save();

        return $photo;
    }

    /** @param array<string, mixed> $ticket */
    private function assertTicketBelongsToPatient(array $ticket, int $dentistId, string $patientId, string $viewType): void
    {
        if (
            (int) ($ticket['dentist_id'] ?? 0) === $dentistId
            && (string) ($ticket['patient_id'] ?? '') === $patientId
            && (string) ($ticket['view_type'] ?? PatientClinicalPhoto::VIEW_TYPE_SMILE) === $viewType
        ) {
            return;
        }

        throw ValidationException::withMessages(['photo' => [$this->message('direct_upload_invalid', 'This upload does not belong to the selected patient.')]]);
    }

    private function buildStoragePath(int $dentistId, string $patientId, string $viewType, string $extension): string
    {
        return sprintf('quarantine/patients/%d/%s/oral-photos/%s/%s.%s', $dentistId, $patientId, $viewType, Str::uuid()->toString(), strtolower($extension));
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

    private function directUploadCacheKey(string $uploadId): string
    {
        return "patient-oral-photo-upload:{$uploadId}";
    }

    private function mediaDiskSupportsDirectUpload(string $disk): bool
    {
        return (string) config("filesystems.disks.{$disk}.driver") === 's3';
    }

    private function resolveUploadedObjectSize(string $disk, string $path, int $expectedSize): int
    {
        if ($expectedSize > 0 && $this->mediaDiskSupportsDirectUpload($disk) && ! (bool) config('filesystems.verify_direct_uploads_on_finalize', false)) {
            return $expectedSize;
        }
        try {
            return max((int) Storage::disk($disk)->size($path), 0);
        } catch (\Throwable) {
            return $expectedSize;
        }
    }

    /**
     * @param  array<string, mixed>  $headers
     * @return array<string, string>
     */
    private function normalizeTemporaryUploadHeaders(array $headers): array
    {
        $normalized = [];
        foreach ($headers as $name => $value) {
            if (strtolower((string) $name) !== 'host') {
                $normalized[(string) $name] = is_array($value)
                    ? implode(', ', array_map(static fn (mixed $item): string => (string) $item, $value))
                    : (string) $value;
            }
        }

        return $normalized;
    }

    private function message(string $key, string $fallback): string
    {
        $translationKey = "api.patients.{$key}";
        return Lang::has($translationKey) ? __($translationKey) : $fallback;
    }
}
