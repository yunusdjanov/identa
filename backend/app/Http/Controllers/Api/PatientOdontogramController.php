<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreOdontogramEntryRequest;
use App\Http\Requests\UpdateOdontogramEntryRequest;
use App\Http\Requests\UploadOdontogramEntryImageRequest;
use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientOdontogramController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {
    }

    private const DEFAULT_PER_PAGE = 15;
    private const MAX_PER_PAGE = 100;
    private const DEFAULT_SUMMARY_LIMIT = 5;
    private const MAX_SUMMARY_LIMIT = 10;

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

    public function downloadImage(Request $request, string $id, string $entryId, string $imageId): StreamedResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $image = $this->findOwnedEntryImage($entry, $imageId);

        if (! Storage::disk($image->disk)->exists($image->path)) {
            abort(404);
        }

        return Storage::disk($image->disk)->response(
            $image->path,
            basename($image->path),
            [
                'Content-Type' => $image->mime_type,
                'Cache-Control' => 'private, max-age=300',
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
        if (Storage::disk($image->disk)->exists($image->path)) {
            Storage::disk($image->disk)->delete($image->path);
        }
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
                ])
                ->values()
                ->all(),
        ];
    }

    private function mediaDisk(): string
    {
        return (string) config('filesystems.media_disk', 'local');
    }
}
