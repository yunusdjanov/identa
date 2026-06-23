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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientClinicalPhotoService
{
    private const DIRECT_UPLOAD_TTL_MINUTES = 15;
    private const MAX_ORAL_PHOTOS_PER_VIEW = 6;

    public function __construct(
        private readonly PlanLimitService $planLimitService,
        private readonly PatientClinicalPhotoMediaService $media,
    ) {}

    /** Store a new photo in one of the patient's oral photo slots through the API upload path. */
    public function uploadPrimaryOralQueued(
        Patient $patient,
        UploadedFile $uploadedPhoto,
        User $owner,
        string $viewType = PatientClinicalPhoto::VIEW_TYPE_SMILE
    ): PatientClinicalPhoto {
        $viewType = $this->normalizeViewType($viewType);
        $this->ensurePhotoLimitAvailable($patient, $viewType);
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

        return $this->queueScanOrFail($this->startPendingPhotoOrDelete(
            patient: $patient,
            viewType: $viewType,
            disk: $disk,
            path: $path,
            mimeType: $mimeType,
            fileSize: max((int) Storage::disk($disk)->size($path), 0),
        ), $owner, __('api.patients.photo_store_failed'));
    }

    /** Replace one existing oral photo while retaining the previous image if scanning rejects the edit. */
    public function replaceQueued(
        Patient $patient,
        PatientClinicalPhoto $photo,
        UploadedFile $uploadedPhoto,
        User $owner
    ): PatientClinicalPhoto {
        $this->planLimitService->ensureUploadFileAllowed(
            $owner,
            max((int) $uploadedPhoto->getSize(), 0),
            $uploadedPhoto->getMimeType() ?: $uploadedPhoto->getClientMimeType()
        );

        $viewType = $this->normalizeViewType((string) $photo->view_type);
        $disk = $this->disk();
        $mimeType = (string) ($uploadedPhoto->getMimeType() ?: $uploadedPhoto->getClientMimeType());
        $path = $this->buildStoragePath((int) $patient->dentist_id, (string) $patient->id, $viewType, $this->extensionForMimeType($mimeType));
        $contents = file_get_contents((string) $uploadedPhoto->getRealPath());
        $stored = is_string($contents) && $contents !== '' ? Storage::disk($disk)->put($path, $contents) : false;

        if (! $stored) {
            throw ValidationException::withMessages(['photo' => [__('api.patients.photo_store_failed')]]);
        }

        try {
            $photo = DB::transaction(function () use ($patient, $photo, $disk, $path, $mimeType): PatientClinicalPhoto {
                $lockedPhoto = PatientClinicalPhoto::query()
                    ->whereKey((string) $photo->id)
                    ->where('dentist_id', (int) $patient->dentist_id)
                    ->where('patient_id', (string) $patient->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                $attributes = [
                    'disk' => $disk,
                    'scan_status' => 'pending',
                    'scan_result' => null,
                    'scan_provider' => null,
                    'quarantine_path' => $path,
                    'scanned_at' => null,
                    'rejected_at' => null,
                ];

                if (trim((string) $lockedPhoto->path) === '') {
                    $attributes += [
                        'path' => $path,
                        'mime_type' => $mimeType,
                        'file_size' => max((int) Storage::disk($disk)->size($path), 0),
                        'approved_at' => null,
                    ];
                }

                $lockedPhoto->forceFill($attributes)->save();

                return $lockedPhoto;
            });
        } catch (\Throwable $exception) {
            Storage::disk($disk)->delete($path);
            MediaPathCache::forgetPaths($disk, [$path]);

            throw $exception;
        }

        return $this->queueScanOrFail($photo, $owner, __('api.patients.photo_store_failed'));
    }

    /**
     * Prepare a signed direct-upload ticket for a new oral photo.
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
        $this->ensurePhotoLimitAvailable($patient, $viewType);
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
        try {
            $this->ensurePhotoLimitAvailable($patient, $viewType);
        } catch (\Throwable $exception) {
            Storage::disk($disk)->delete($path);
            MediaPathCache::forgetPaths($disk, [$path]);
            throw $exception;
        }

        $storedSize = $this->resolveUploadedObjectSize($disk, $path, (int) ($ticket['file_size'] ?? 0));
        if ($storedSize <= 0) {
            Storage::disk($disk)->delete($path);
            MediaPathCache::forgetPaths($disk, [$path]);

            throw ValidationException::withMessages(['photo' => [$this->message('direct_upload_missing', 'The uploaded oral photo could not be found in storage. Please retry the upload.')]]);
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

        return $this->queueScanOrFail($this->startPendingPhotoOrDelete(
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
        $query = $this->slotPhotoQuery($patient, $viewType);
        if ($viewType === PatientClinicalPhoto::VIEW_TYPE_SMILE) {
            $query->orderByRaw(
                'case when view_type = ? then 0 else 1 end',
                [PatientClinicalPhoto::VIEW_TYPE_SMILE]
            );
        }

        return $query
            ->orderByDesc('is_primary')
            ->orderBy('sort_order')
            ->orderBy('created_at')
            ->firstOrFail();
    }

    /** Return one gallery photo by id, constrained to the requested patient and slot. */
    public function oralPhotoItemOrFail(
        Patient $patient,
        string $viewType,
        string $photoId
    ): PatientClinicalPhoto {
        $viewType = $this->normalizeViewType($viewType);

        return $this->slotPhotoQuery($patient, $viewType)
            ->whereKey($photoId)
            ->firstOrFail();
    }

    /** Stream the original or requested variant through the protected API route. */
    public function stream(PatientClinicalPhoto $photo, ?string $variant = null): StreamedResponse
    {
        return $this->media->stream($photo, $variant);
    }

    /** Delete the photo record and queue deletion for the source object and generated variants. */
    public function delete(PatientClinicalPhoto $photo): void
    {
        $wasPrimary = (bool) $photo->is_primary;

        $this->media->delete($photo);
        $photo->delete();

        if ($wasPrimary) {
            $this->promotePrimaryAfterDelete($photo);
        }
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

    /**
     * Build all oral-photo gallery payloads keyed by slot name.
     *
     * @param  iterable<PatientClinicalPhoto>  $photos
     * @return array<string, list<array<string, mixed>>>
     */
    public function resourceGalleryPayload(Patient $patient, iterable $photos, Request $request): array
    {
        return $this->media->resourceGalleryPayload($patient, $photos, $request);
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
        if ((string) $photo->scan_status === PatientClinicalPhoto::SCAN_STATUS_REJECTED) {
            $this->delete($photo);
            throw ValidationException::withMessages(['photo' => [$message]]);
        }

        return $photo;
    }

    private function startPendingPhoto(
        Patient $patient,
        string $viewType,
        string $disk,
        string $path,
        string $mimeType,
        int $fileSize
    ): PatientClinicalPhoto
    {
        return DB::transaction(function () use ($patient, $viewType, $disk, $path, $mimeType, $fileSize): PatientClinicalPhoto {
            $lockedPatient = Patient::query()
                ->whereKey((string) $patient->id)
                ->where('dentist_id', (int) $patient->dentist_id)
                ->lockForUpdate()
                ->firstOrFail();
            $this->ensurePhotoLimitAvailable($lockedPatient, $viewType);
            $isPrimary = ! $this->slotPhotoQuery($lockedPatient, $viewType)->exists();
            $sortOrder = ((int) $this->slotPhotoQuery($lockedPatient, $viewType)->max('sort_order')) + 1;

            $photo = new PatientClinicalPhoto();
            $photo->forceFill([
                'dentist_id' => (int) $patient->dentist_id,
                'patient_id' => (string) $patient->id,
                'view_type' => $viewType,
                'is_primary' => $isPrimary,
                'sort_order' => $sortOrder,
                'disk' => $disk,
                'path' => $path,
                'mime_type' => $mimeType,
                'file_size' => $fileSize,
                'scan_status' => 'pending',
                'scan_result' => null,
                'scan_provider' => null,
                'quarantine_path' => $path,
                'approved_at' => null,
                'scanned_at' => null,
                'rejected_at' => null,
            ])->save();

            return $photo;
        });
    }

    private function startPendingPhotoOrDelete(
        Patient $patient,
        string $viewType,
        string $disk,
        string $path,
        string $mimeType,
        int $fileSize
    ): PatientClinicalPhoto {
        try {
            return $this->startPendingPhoto($patient, $viewType, $disk, $path, $mimeType, $fileSize);
        } catch (\Throwable $exception) {
            Storage::disk($disk)->delete($path);
            MediaPathCache::forgetPaths($disk, [$path]);
            throw $exception;
        }
    }

    private function ensurePhotoLimitAvailable(Patient $patient, string $viewType): void
    {
        if ($this->slotPhotoQuery($patient, $viewType)->count() < self::MAX_ORAL_PHOTOS_PER_VIEW) {
            return;
        }

        throw ValidationException::withMessages([
            'photo' => [$this->message('oral_photo_limit_reached', 'Each oral photo section can contain up to 6 images.')],
        ]);
    }

    private function promotePrimaryAfterDelete(PatientClinicalPhoto $deletedPhoto): void
    {
        $viewType = $this->normalizeViewType((string) $deletedPhoto->view_type);
        $replacement = $this->slotPhotoQueryFor(
            (int) $deletedPhoto->dentist_id,
            (string) $deletedPhoto->patient_id,
            $viewType
        )
            ->whereKeyNot((string) $deletedPhoto->id)
            ->orderBy('sort_order')
            ->orderBy('created_at')
            ->first();

        if ($replacement !== null) {
            $replacement->forceFill(['is_primary' => true])->save();
        }
    }

    private function slotPhotoQuery(Patient $patient, string $viewType)
    {
        return $this->slotPhotoQueryFor((int) $patient->dentist_id, (string) $patient->id, $viewType);
    }

    private function slotPhotoQueryFor(int $dentistId, string $patientId, string $viewType)
    {
        $query = PatientClinicalPhoto::query()
            ->where('dentist_id', $dentistId)
            ->where('patient_id', $patientId)
            ->where('scan_status', '!=', PatientClinicalPhoto::SCAN_STATUS_REJECTED);

        if ($viewType === PatientClinicalPhoto::VIEW_TYPE_SMILE) {
            return $query->whereIn('view_type', [
                PatientClinicalPhoto::VIEW_TYPE_SMILE,
                PatientClinicalPhoto::VIEW_TYPE_LEGACY_ORAL_PRIMARY,
            ]);
        }

        return $query->where('view_type', $viewType);
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
        if (! (bool) config('filesystems.verify_direct_uploads_on_finalize', true)) {
            return max($expectedSize, 0);
        }

        try {
            return max((int) Storage::disk($disk)->size($path), 0);
        } catch (\Throwable) {
            return 0;
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
