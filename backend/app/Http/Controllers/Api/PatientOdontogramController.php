<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PrepareOdontogramEntryImageUploadRequest;
use App\Http\Requests\StoreOdontogramEntryRequest;
use App\Http\Requests\UpdateOdontogramEntryRequest;
use App\Http\Requests\UploadOdontogramEntryImageRequest;
use App\Jobs\DeleteStoredMediaPaths;
use App\Jobs\GenerateMediaVariants;
use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\ImageVariantGenerator;
use App\Support\MediaPathCache;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientOdontogramController extends Controller
{
    private const IMAGE_VARIANT_THUMBNAIL = 'thumbnail';
    private const IMAGE_VARIANT_PREVIEW = 'preview';
    private const THUMBNAIL_MAX_EDGE = 160;
    private const PREVIEW_MAX_EDGE = 960;
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
        private readonly AuditLogger $auditLogger,
    ) {
    }

    private const DEFAULT_PER_PAGE = 15;
    private const MAX_PER_PAGE = 100;
    private const DEFAULT_SUMMARY_LIMIT = 5;
    private const MAX_SUMMARY_LIMIT = 10;
    private const DIRECT_UPLOAD_TTL_MINUTES = 15;

    /**
     * @var list<string>
     */
    private const ALLOWED_SORT_FIELDS = [
        'tooth_number',
        'condition_date',
        'created_at',
    ];

    public function index(Request $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        $perPage = $this->resolvePerPage($request);

        $query = OdontogramEntry::query()
            ->where('dentist_id', $this->resolveDentistId($request))
            ->where('patient_id', $patient->id)
            ->with('images');

        $toothNumber = $request->input('filter.tooth_number');
        if (is_scalar($toothNumber) && $toothNumber !== '') {
            $query->where('tooth_number', (int) $toothNumber);
        }

        $this->applySort($query, $request->query('sort', 'tooth_number,condition_date,created_at'));

        $entries = $query->paginate($perPage);

        return response()->json([
            'data' => $entries
                ->getCollection()
                ->map(fn (OdontogramEntry $entry): array => $this->transformOdontogramEntry($entry))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $entries->currentPage(),
                    'per_page' => $entries->perPage(),
                    'total' => $entries->total(),
                    'total_pages' => $entries->lastPage(),
                ],
            ],
        ]);
    }

    public function store(StoreOdontogramEntryRequest $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_add')],
            ]);
        }
        $validated = $request->validated();

        $entry = OdontogramEntry::query()->create([
            ...$validated,
            'dentist_id' => $this->resolveDentistId($request),
            'patient_id' => $patient->id,
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.odontogram_entry.created',
            entityType: 'odontogram_entry',
            entityId: (string) $entry->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'tooth_number' => $entry->tooth_number,
                'condition_type' => $entry->condition_type,
            ],
        );

        return response()->json([
            'data' => $this->transformOdontogramEntry($entry->load('images')),
        ], 201);
    }

    public function update(UpdateOdontogramEntryRequest $request, string $id, string $entryId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_edit')],
            ]);
        }

        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $validated = $request->validated();
        $entry->update($validated);
        $entry->load('images');

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.odontogram_entry.updated',
            entityType: 'odontogram_entry',
            entityId: (string) $entry->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'tooth_number' => $entry->tooth_number,
                'condition_type' => $entry->condition_type,
            ],
        );

        return response()->json([
            'data' => $this->transformOdontogramEntry($entry),
        ]);
    }

    public function destroy(Request $request, string $id, string $entryId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_delete')],
            ]);
        }
        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);

        if ($entry->invoiceItems()->exists()) {
            throw ValidationException::withMessages([
                'entry' => [__('api.odontogram.cannot_delete_linked_to_billing')],
            ]);
        }

        foreach ($entry->images as $image) {
            $this->deleteImageFile($image);
        }

        $entry->delete();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.odontogram_entry.deleted',
            entityType: 'odontogram_entry',
            entityId: (string) $entry->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'tooth_number' => $entry->tooth_number,
            ],
        );

        return response()->json([], 204);
    }

    public function uploadImage(UploadOdontogramEntryImageRequest $request, string $id, string $entryId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_upload_images')],
            ]);
        }

        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $validated = $request->validated();
        $uploadedFile = $request->file('image');
        if ($uploadedFile === null) {
            throw ValidationException::withMessages([
                'image' => [__('api.odontogram.image_required')],
            ]);
        }

        $extension = strtolower($uploadedFile->getClientOriginalExtension() ?: $uploadedFile->extension() ?: 'jpg');
        $directory = sprintf(
            'odontogram/%d/%s/%s',
            $this->resolveDentistId($request),
            (string) $patient->id,
            (string) $entry->id
        );
        $filename = sprintf('%s-%s.%s', $validated['stage'], Str::uuid()->toString(), $extension);
        $disk = $this->mediaDisk();
        $path = $uploadedFile->storeAs($directory, $filename, [
            'disk' => $disk,
        ]);

        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages([
                'image' => [__('api.odontogram.image_store_failed')],
            ]);
        }

        $existingImage = $entry->images()
            ->where('stage', $validated['stage'])
            ->first();

        if ($existingImage) {
            $this->deleteImageFile($existingImage);
            $existingImage->update([
                'disk' => $disk,
                'path' => $path,
                'mime_type' => $uploadedFile->getClientMimeType() ?: 'application/octet-stream',
                'file_size' => (int) ($uploadedFile->getSize() ?: 0),
                'captured_at' => $validated['captured_at'] ?? null,
            ]);
        } else {
            $entry->images()->create([
                'dentist_id' => $this->resolveDentistId($request),
                'stage' => $validated['stage'],
                'disk' => $disk,
                'path' => $path,
                'mime_type' => $uploadedFile->getClientMimeType() ?: 'application/octet-stream',
                'file_size' => (int) ($uploadedFile->getSize() ?: 0),
                'captured_at' => $validated['captured_at'] ?? null,
            ]);
        }

        MediaPathCache::markPresent($disk, $path);
        $this->queueOdontogramImageVariants($disk, $path);
        $entry->load('images');

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.odontogram_entry.image.uploaded',
            entityType: 'odontogram_entry',
            entityId: (string) $entry->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'stage' => $validated['stage'],
            ],
        );

        return response()->json([
            'data' => $this->transformOdontogramEntry($entry),
        ]);
    }

    public function prepareImageUpload(
        PrepareOdontogramEntryImageUploadRequest $request,
        string $id,
        string $entryId
    ): JsonResponse {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_upload_images')],
            ]);
        }

        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $disk = $this->mediaDisk();
        if (! $this->mediaDiskSupportsDirectUpload($disk)) {
            return response()->json([
                'data' => [
                    'supported' => false,
                ],
            ]);
        }

        $validated = $request->validated();
        $path = $this->buildOdontogramImageStoragePath(
            dentistId: $this->resolveDentistId($request),
            patientId: (string) $patient->id,
            entryId: (string) $entry->id,
            stage: (string) $validated['stage'],
            extension: $this->resolveUploadExtension(
                filename: (string) $validated['filename'],
                contentType: (string) $validated['content_type'],
            ),
        );
        $uploadId = (string) Str::uuid();

        try {
            $temporaryUpload = Storage::disk($disk)->temporaryUploadUrl(
                $path,
                now()->addMinutes(self::DIRECT_UPLOAD_TTL_MINUTES),
                [
                    'ContentType' => $validated['content_type'],
                ]
            );
        } catch (RuntimeException) {
            return response()->json([
                'data' => [
                    'supported' => false,
                ],
            ]);
        }

        Cache::put(
            $this->directUploadCacheKey($uploadId),
            [
                'dentist_id' => $this->resolveDentistId($request),
                'patient_id' => (string) $patient->id,
                'entry_id' => (string) $entry->id,
                'stage' => (string) $validated['stage'],
                'captured_at' => $validated['captured_at'] ?? null,
                'disk' => $disk,
                'path' => $path,
                'mime_type' => (string) $validated['content_type'],
                'file_size' => (int) $validated['file_size'],
            ],
            now()->addMinutes(self::DIRECT_UPLOAD_TTL_MINUTES)
        );

        return response()->json([
            'data' => [
                'supported' => true,
                'upload_id' => $uploadId,
                'method' => 'PUT',
                'url' => $temporaryUpload['url'],
                'headers' => $this->normalizeTemporaryUploadHeaders($temporaryUpload['headers'] ?? []),
                'expires_at' => now()->addMinutes(self::DIRECT_UPLOAD_TTL_MINUTES)->toIso8601String(),
            ],
        ]);
    }

    public function finalizeImageUpload(
        Request $request,
        string $id,
        string $entryId,
        string $uploadId
    ): JsonResponse {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_upload_images')],
            ]);
        }

        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $ticket = Cache::pull($this->directUploadCacheKey($uploadId));

        if (! is_array($ticket)) {
            throw ValidationException::withMessages([
                'image' => [$this->odontogramMessage(
                    'direct_upload_expired',
                    'The upload session expired. Please try uploading the image again.'
                )],
            ]);
        }

        $dentistId = $this->resolveDentistId($request);
        if (
            (int) ($ticket['dentist_id'] ?? 0) !== $dentistId
            || (string) ($ticket['patient_id'] ?? '') !== (string) $patient->id
            || (string) ($ticket['entry_id'] ?? '') !== (string) $entry->id
        ) {
            throw ValidationException::withMessages([
                'image' => [$this->odontogramMessage(
                    'direct_upload_invalid',
                    'This upload does not belong to the selected odontogram record.'
                )],
            ]);
        }

        $disk = (string) ($ticket['disk'] ?? '');
        $path = (string) ($ticket['path'] ?? '');
        if ($disk === '' || $path === '') {
            throw ValidationException::withMessages([
                'image' => [$this->odontogramMessage(
                    'direct_upload_missing',
                    'The uploaded image could not be found in storage. Please retry the upload.'
                )],
            ]);
        }

        $existingImage = $entry->images()
            ->where('stage', (string) $ticket['stage'])
            ->first();

        if ($existingImage) {
            $this->deleteImageFile($existingImage);
            $existingImage->update([
                'disk' => $disk,
                'path' => $path,
                'mime_type' => (string) $ticket['mime_type'],
                'file_size' => $this->resolveUploadedObjectSize($disk, $path, (int) ($ticket['file_size'] ?? 0)),
                'captured_at' => $ticket['captured_at'] ?? null,
            ]);
        } else {
            $entry->images()->create([
                'dentist_id' => $dentistId,
                'stage' => (string) $ticket['stage'],
                'disk' => $disk,
                'path' => $path,
                'mime_type' => (string) $ticket['mime_type'],
                'file_size' => $this->resolveUploadedObjectSize($disk, $path, (int) ($ticket['file_size'] ?? 0)),
                'captured_at' => $ticket['captured_at'] ?? null,
            ]);
        }

        MediaPathCache::markPresent($disk, $path);
        $this->queueOdontogramImageVariants($disk, $path);
        $entry->load('images');

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.odontogram_entry.image.uploaded',
            entityType: 'odontogram_entry',
            entityId: (string) $entry->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'stage' => (string) $ticket['stage'],
                'direct_upload' => true,
            ],
        );

        return response()->json([
            'data' => $this->transformOdontogramEntry($entry),
        ]);
    }

    public function downloadImage(Request $request, string $id, string $entryId, string $imageId): StreamedResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $image = $this->findOwnedEntryImage($entry, $imageId);
        $variant = $request->query('variant');
        $variant = is_string($variant) && $variant !== '' ? $variant : null;

        if ($variant !== null) {
            $variantResponse = $this->streamOdontogramImageVariant($image, $variant);
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

    public function deleteImage(Request $request, string $id, string $entryId, string $imageId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_delete_images')],
            ]);
        }

        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $image = $this->findOwnedEntryImage($entry, $imageId);
        $stage = (string) $image->stage;

        $this->deleteImageFile($image);
        $image->delete();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.odontogram_entry.image.deleted',
            entityType: 'odontogram_entry',
            entityId: (string) $entry->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'stage' => $stage,
            ],
        );

        return response()->json([], 204);
    }

    public function summary(Request $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        $dentistId = $this->resolveDentistId($request);
        $limit = $this->resolveSummaryLimit($request);

        $baseQuery = OdontogramEntry::query()
            ->where('dentist_id', $dentistId)
            ->where('patient_id', $patient->id);

        $totalEntries = (clone $baseQuery)->count();

        $historyCountByTooth = (clone $baseQuery)
            ->selectRaw('tooth_number, COUNT(*) as history_count')
            ->groupBy('tooth_number')
            ->pluck('history_count', 'tooth_number');

        $latestByTooth = (clone $baseQuery)
            ->whereRaw(
                'id = (
                    select oe2.id
                    from odontogram_entries as oe2
                    where oe2.dentist_id = odontogram_entries.dentist_id
                      and oe2.patient_id = odontogram_entries.patient_id
                      and oe2.tooth_number = odontogram_entries.tooth_number
                    order by oe2.condition_date desc, oe2.created_at desc, oe2.id desc
                    limit 1
                )'
            )
            ->orderByDesc('condition_date')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();

        return response()->json([
            'data' => [
                'total_entries' => $totalEntries,
                'affected_teeth_count' => $historyCountByTooth->count(),
                'latest_conditions' => $latestByTooth
                    ->map(
                        fn (OdontogramEntry $entry): array => [
                            'tooth_number' => $entry->tooth_number,
                            'condition_type' => $entry->condition_type,
                            'history_count' => (int) ($historyCountByTooth[(string) $entry->tooth_number] ?? 1),
                            'condition_date' => $entry->condition_date?->toDateString(),
                            'created_at' => $entry->created_at?->toIso8601String(),
                        ]
                    )
                    ->values()
                    ->all(),
            ],
        ]);
    }

    private function findOwnedPatient(Request $request, string $id): Patient
    {
        return Patient::query()
            ->withTrashed()
            ->where('id', $id)
            ->where('dentist_id', $this->resolveDentistId($request))
            ->firstOrFail();
    }

    private function findOwnedEntry(Request $request, string $patientId, string $entryId): OdontogramEntry
    {
        return OdontogramEntry::query()
            ->where('id', $entryId)
            ->where('dentist_id', $this->resolveDentistId($request))
            ->where('patient_id', $patientId)
            ->with('images')
            ->firstOrFail();
    }

    private function resolveDentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }

    private function findOwnedEntryImage(OdontogramEntry $entry, string $imageId): OdontogramEntryImage
    {
        return $entry->images()
            ->where('id', $imageId)
            ->firstOrFail();
    }

    private function deleteImageFile(OdontogramEntryImage $image): void
    {
        $this->queueOdontogramImageDeletion((string) $image->disk, (string) $image->path);
    }

    private function resolvePerPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        return min($perPage, self::MAX_PER_PAGE);
    }

    private function resolveSummaryLimit(Request $request): int
    {
        $limit = (int) $request->query('limit', self::DEFAULT_SUMMARY_LIMIT);
        if ($limit < 1) {
            return self::DEFAULT_SUMMARY_LIMIT;
        }

        return min($limit, self::MAX_SUMMARY_LIMIT);
    }

    private function applySort(Builder $query, mixed $sort): void
    {
        if (! is_string($sort) || $sort === '') {
            $query->orderBy('tooth_number')->orderBy('condition_date')->orderBy('created_at');

            return;
        }

        $applied = false;
        foreach (explode(',', $sort) as $segment) {
            $segment = trim($segment);
            if ($segment === '') {
                continue;
            }

            $direction = str_starts_with($segment, '-') ? 'desc' : 'asc';
            $field = ltrim($segment, '-');

            if (! in_array($field, self::ALLOWED_SORT_FIELDS, true)) {
                continue;
            }

            $query->orderBy($field, $direction);
            $applied = true;
        }

        if (! $applied) {
            $query->orderBy('tooth_number')->orderBy('condition_date')->orderBy('created_at');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function transformOdontogramEntry(OdontogramEntry $entry): array
    {
        return [
            'id' => (string) $entry->id,
            'patient_id' => (string) $entry->patient_id,
            'tooth_number' => $entry->tooth_number,
            'condition_type' => $entry->condition_type,
            'surface' => $entry->surface,
            'material' => $entry->material,
            'severity' => $entry->severity,
            'condition_date' => $entry->condition_date?->toDateString(),
            'notes' => $entry->notes,
            'created_at' => $entry->created_at?->toIso8601String(),
            'images' => $entry->images
                ->sortBy('stage')
                ->map(fn (OdontogramEntryImage $image): array => [
                    'id' => (string) $image->id,
                    'stage' => $image->stage,
                    'mime_type' => $image->mime_type,
                    'file_size' => (int) $image->file_size,
                    'captured_at' => $image->captured_at?->toDateString(),
                    'created_at' => $image->created_at?->toIso8601String(),
                    'url' => $this->buildOdontogramImageUrl($entry, $image),
                    'thumbnail_url' => $this->buildOdontogramImageUrl($entry, $image, self::IMAGE_VARIANT_THUMBNAIL),
                    'preview_url' => $this->buildOdontogramImageUrl($entry, $image, self::IMAGE_VARIANT_PREVIEW),
                    'thumbnail_ready' => $this->isOdontogramImageVariantReady($image, self::IMAGE_VARIANT_THUMBNAIL),
                    'preview_ready' => $this->isOdontogramImageVariantReady($image, self::IMAGE_VARIANT_PREVIEW),
                ])
                ->values()
                ->all(),
        ];
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

    private function buildOdontogramImageStoragePath(
        int $dentistId,
        string $patientId,
        string $entryId,
        string $stage,
        string $extension
    ): string {
        return sprintf(
            'odontogram/%d/%s/%s/%s-%s.%s',
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

    private function buildOdontogramImageUrl(
        OdontogramEntry $entry,
        OdontogramEntryImage $image,
        ?string $variant = null
    ): ?string
    {
        $disk = (string) $image->disk;
        $path = (string) $image->path;

        if ($variant !== null) {
            $variantPath = $this->buildOdontogramImageVariantPath($path, $variant);
            if (! $this->mediaPathExists($disk, $variantPath)) {
                if ($this->mediaDiskSupportsDirectUpload($disk)) {
                    return $this->buildTemporaryMediaUrl(
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

            $temporaryVariantUrl = $this->buildTemporaryMediaUrl(
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

    private function buildTemporaryMediaUrl(
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

    private function isOdontogramImageVariantReady(OdontogramEntryImage $image, string $variant): bool
    {
        return $this->mediaPathExists(
            (string) $image->disk,
            $this->buildOdontogramImageVariantPath((string) $image->path, $variant)
        );
    }

    private function buildOdontogramImageVariantPath(string $path, string $variant): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        return sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension);
    }

    private function queueOdontogramImageDeletion(string $disk, string $path): void
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
                $this->buildOdontogramImageVariantPath($path, self::IMAGE_VARIANT_THUMBNAIL),
                $this->buildOdontogramImageVariantPath($path, self::IMAGE_VARIANT_PREVIEW),
            ],
            logContext: 'Odontogram image'
        )->afterResponse();
    }

    private function queueOdontogramImageVariants(string $disk, string $path): void
    {
        GenerateMediaVariants::dispatch(
            disk: $disk,
            sourcePath: $path,
            variants: [
                self::IMAGE_VARIANT_THUMBNAIL => [
                    'path' => $this->buildOdontogramImageVariantPath($path, self::IMAGE_VARIANT_THUMBNAIL),
                    'max_edge' => self::THUMBNAIL_MAX_EDGE,
                ],
                self::IMAGE_VARIANT_PREVIEW => [
                    'path' => $this->buildOdontogramImageVariantPath($path, self::IMAGE_VARIANT_PREVIEW),
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

    private function streamOdontogramImageVariant(OdontogramEntryImage $image, string $variant): ?StreamedResponse
    {
        if (! array_key_exists($variant, self::IMAGE_VARIANT_MAX_EDGES)) {
            abort(404);
        }

        $disk = (string) $image->disk;
        $sourcePath = (string) $image->path;
        $variantPath = $this->buildOdontogramImageVariantPath($sourcePath, $variant);
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

    private function odontogramMessage(string $key, string $fallback): string
    {
        $translationKey = "api.odontogram.{$key}";

        return Lang::has($translationKey) ? __($translationKey) : $fallback;
    }
}
