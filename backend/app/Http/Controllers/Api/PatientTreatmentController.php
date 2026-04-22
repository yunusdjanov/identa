<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PrepareTreatmentImageUploadRequest;
use App\Http\Requests\StoreTreatmentRequest;
use App\Http\Requests\UpdateTreatmentRequest;
use App\Http\Requests\UploadTreatmentImageRequest;
use App\Jobs\DeleteStoredMediaPaths;
use App\Jobs\GenerateMediaVariants;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Support\MediaPathCache;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\ImageVariantGenerator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
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

class PatientTreatmentController extends Controller
{
    private const MAX_IMAGES_PER_TREATMENT = 10;
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
        private readonly AuditLogger $auditLogger,
    ) {
    }

    private const DEFAULT_PER_PAGE = 15;
    private const MAX_PER_PAGE = 500;
    private const DIRECT_UPLOAD_TTL_MINUTES = 15;

    /**
     * @var list<string>
     */
    private const ALLOWED_SORT_FIELDS = [
        'treatment_date',
        'created_at',
        'cost',
        'tooth_number',
    ];

    public function index(Request $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        $perPage = $this->resolvePerPage($request);
        $includeImages = $this->shouldIncludeImages($request);

        $query = Treatment::query()
            ->where('dentist_id', $this->resolveDentistId($request))
            ->where('patient_id', $patient->id)
            ->withCount('images');

        if ($includeImages) {
            $query->with('images');
        } else {
            $query->with('primaryImage');
        }

        $this->applySort($query, $request->query('sort', '-treatment_date,-created_at'));

        $treatments = $query->paginate($perPage);

        return response()->json([
            'data' => $treatments
                ->getCollection()
                ->map(fn (Treatment $treatment): array => $this->transformTreatment($treatment, $includeImages))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $treatments->currentPage(),
                    'per_page' => $treatments->perPage(),
                    'total' => $treatments->total(),
                    'total_pages' => $treatments->lastPage(),
                ],
            ],
        ]);
    }

    public function indexAll(Request $request): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);
        $perPage = $this->resolvePerPage($request);
        $includeImages = $this->shouldIncludeImages($request);

        $baseQuery = Treatment::query()
            ->where('dentist_id', $dentistId)
            ->with([
                'patient:id,full_name,phone,secondary_phone,patient_id',
            ]);

        $patientId = $request->input('filter.patient_id');
        if (is_string($patientId) && $patientId !== '') {
            $baseQuery->where('patient_id', $patientId);
        }

        $dateFrom = $request->input('filter.date_from');
        if (is_string($dateFrom) && $dateFrom !== '') {
            $baseQuery->whereDate('treatment_date', '>=', $dateFrom);
        }

        $dateTo = $request->input('filter.date_to');
        if (is_string($dateTo) && $dateTo !== '') {
            $baseQuery->whereDate('treatment_date', '<=', $dateTo);
        }

        $search = $request->input('filter.search');
        if (is_string($search) && trim($search) !== '') {
            $search = trim($search);
            $baseQuery->where(function (Builder $builder) use ($search): void {
                $builder
                    ->where('treatment_type', 'like', "%{$search}%")
                    ->orWhere('comment', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhereHas('patient', function (Builder $patientBuilder) use ($search): void {
                        $patientBuilder
                            ->where('full_name', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%")
                            ->orWhere('secondary_phone', 'like', "%{$search}%")
                            ->orWhere('patient_id', 'like', "%{$search}%");
                    });
            });
        }

        $summaryQuery = clone $baseQuery;
        $query = clone $baseQuery;

        $query->withCount('images');
        if ($includeImages) {
            $query->with('images');
        } else {
            $query->with('primaryImage');
        }

        $this->applySort($query, $request->query('sort', '-treatment_date,-created_at'));
        $treatments = $query->paginate($perPage);
        $totalCount = (clone $summaryQuery)->count();
        $totalDebt = (float) ((clone $summaryQuery)->sum('debt_amount'));
        $totalPaid = (float) ((clone $summaryQuery)->sum('paid_amount'));

        return response()->json([
            'data' => $treatments
                ->getCollection()
                ->map(fn (Treatment $treatment): array => $this->transformTreatment($treatment, $includeImages))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $treatments->currentPage(),
                    'per_page' => $treatments->perPage(),
                    'total' => $treatments->total(),
                    'total_pages' => $treatments->lastPage(),
                ],
                'summary' => [
                    'total_count' => $totalCount,
                    'total_debt' => $totalDebt,
                    'total_paid' => $totalPaid,
                    'total_balance' => $totalDebt - $totalPaid,
                ],
            ],
        ]);
    }

    public function show(Request $request, string $id, string $treatmentId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $treatment->load('images');

        return response()->json([
            'data' => $this->transformTreatment($treatment, true),
        ]);
    }

    public function store(StoreTreatmentRequest $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_add')],
            ]);
        }
        $validated = $request->validated();
        $dentistId = $this->resolveDentistId($request);

        $treatment = Treatment::query()->create([
            ...$this->buildTreatmentPayload($validated),
            'dentist_id' => $dentistId,
            'patient_id' => $patient->id,
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.created',
            entityType: 'treatment',
            entityId: (string) $treatment->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'teeth' => $treatment->teeth,
                'treatment_type' => $treatment->treatment_type,
                'debt_amount' => $treatment->debt_amount !== null ? (float) $treatment->debt_amount : null,
                'paid_amount' => $treatment->paid_amount !== null ? (float) $treatment->paid_amount : null,
            ],
        );

        return response()->json([
            'data' => $this->transformTreatment($treatment, false),
        ], 201);
    }

    public function update(UpdateTreatmentRequest $request, string $id, string $treatmentId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_edit')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $treatment->fill($this->buildTreatmentPayload($request->validated()));
        $treatment->save();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.updated',
            entityType: 'treatment',
            entityId: (string) $treatment->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'teeth' => $treatment->teeth,
                'treatment_type' => $treatment->treatment_type,
            ],
        );

        return response()->json([
            'data' => $this->transformTreatment($treatment->fresh(), false),
        ]);
    }

    public function destroy(Request $request, string $id, string $treatmentId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_delete')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $this->deleteAllTreatmentImages($treatment);
        $treatment->delete();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.deleted',
            entityType: 'treatment',
            entityId: (string) $treatmentId,
            metadata: [
                'patient_id' => (string) $patient->id,
            ],
        );

        return response()->json([], 204);
    }

    public function uploadImage(UploadTreatmentImageRequest $request, string $id, string $treatmentId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_upload_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $uploadedFile = $request->file('image');
        if (! $uploadedFile instanceof UploadedFile) {
            throw ValidationException::withMessages([
                'image' => [__('api.treatments.image_required')],
            ]);
        }

        $existingImagesCount = $treatment->images()->count();
        if ($existingImagesCount >= self::MAX_IMAGES_PER_TREATMENT) {
            throw ValidationException::withMessages([
                'image' => [__('api.treatments.max_images_reached', ['max' => self::MAX_IMAGES_PER_TREATMENT])],
            ]);
        }

        $path = $this->storeTreatmentImage($request, $patient, $treatment, $uploadedFile);
        $disk = $this->mediaDisk();
        $image = $treatment->images()->create([
            'dentist_id' => $this->resolveDentistId($request),
            'disk' => $disk,
            'path' => $path,
            'mime_type' => $uploadedFile->getClientMimeType() ?: 'application/octet-stream',
            'file_size' => max((int) $uploadedFile->getSize(), 0),
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.image.uploaded',
            entityType: 'treatment',
            entityId: (string) $treatment->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'image_id' => (string) $image->id,
            ],
        );

        return response()->json([
            'data' => $this->transformTreatmentImage($treatment, $image),
        ], 201);
    }

    public function prepareImageUpload(
        PrepareTreatmentImageUploadRequest $request,
        string $id,
        string $treatmentId
    ): JsonResponse {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_upload_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $existingImagesCount = $treatment->images()->count();
        if ($existingImagesCount >= self::MAX_IMAGES_PER_TREATMENT) {
            throw ValidationException::withMessages([
                'image' => [__('api.treatments.max_images_reached', ['max' => self::MAX_IMAGES_PER_TREATMENT])],
            ]);
        }

        $disk = $this->mediaDisk();
        if (! $this->mediaDiskSupportsDirectUpload($disk)) {
            return response()->json([
                'data' => [
                    'supported' => false,
                ],
            ]);
        }

        $validated = $request->validated();
        $path = $this->buildTreatmentImageStoragePath(
            dentistId: $this->resolveDentistId($request),
            patientId: (string) $patient->id,
            treatmentId: (string) $treatment->id,
            extension: $this->resolveUploadExtension(
                filename: (string) $validated['filename'],
                contentType: (string) $validated['content_type']
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
                'treatment_id' => (string) $treatment->id,
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
        string $treatmentId,
        string $uploadId
    ): JsonResponse {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_upload_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $ticket = Cache::pull($this->directUploadCacheKey($uploadId));

        if (! is_array($ticket)) {
            throw ValidationException::withMessages([
                'image' => [$this->treatmentMessage(
                    'direct_upload_expired',
                    'The upload session expired. Please try uploading the image again.'
                )],
            ]);
        }

        $dentistId = $this->resolveDentistId($request);
        if (
            (int) ($ticket['dentist_id'] ?? 0) !== $dentistId
            || (string) ($ticket['patient_id'] ?? '') !== (string) $patient->id
            || (string) ($ticket['treatment_id'] ?? '') !== (string) $treatment->id
        ) {
            throw ValidationException::withMessages([
                'image' => [$this->treatmentMessage(
                    'direct_upload_invalid',
                    'This upload does not belong to the selected treatment entry.'
                )],
            ]);
        }

        if ($treatment->images()->count() >= self::MAX_IMAGES_PER_TREATMENT) {
            $this->deleteDirectUploadObject((string) $ticket['disk'], (string) $ticket['path']);

            throw ValidationException::withMessages([
                'image' => [__('api.treatments.max_images_reached', ['max' => self::MAX_IMAGES_PER_TREATMENT])],
            ]);
        }

        $disk = (string) $ticket['disk'];
        $path = (string) $ticket['path'];

        if (! Storage::disk($disk)->exists($path)) {
            throw ValidationException::withMessages([
                'image' => [$this->treatmentMessage(
                    'direct_upload_missing',
                    'The uploaded image could not be found in storage. Please retry the upload.'
                )],
            ]);
        }

        $storedSize = (int) Storage::disk($disk)->size($path);
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
            'mime_type' => (string) $ticket['mime_type'],
            'file_size' => $storedSize,
        ]);

        MediaPathCache::markPresent($disk, $path);
        $this->queueTreatmentImageVariants($disk, $path);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.image.uploaded',
            entityType: 'treatment',
            entityId: (string) $treatment->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'image_id' => (string) $image->id,
                'direct_upload' => true,
            ],
        );

        return response()->json([
            'data' => $this->transformTreatmentImage($treatment, $image),
        ], 201);
    }

    public function downloadImage(Request $request, string $id, string $treatmentId, string $imageId): StreamedResponse
    {
        $image = $this->findOwnedTreatmentImageForMedia($request, $id, $treatmentId, $imageId);

        $disk = trim((string) $image->disk);
        $path = trim((string) $image->path);
        $variant = $request->query('variant');
        $variant = is_string($variant) && $variant !== '' ? $variant : null;

        if ($disk === '' || $path === '') {
            abort(404);
        }

        if ($variant !== null) {
            $variantResponse = $this->streamTreatmentImageVariant($disk, $path, $variant);
            if ($variantResponse !== null) {
                return $variantResponse;
            }
        }

        if (! Storage::disk($disk)->exists($path)) {
            abort(404);
        }

        return $this->streamStoredTreatmentImage($disk, $path, $image->mime_type);
    }

    public function deleteImage(Request $request, string $id, string $treatmentId, string $imageId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_delete_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $image = $this->findOwnedTreatmentImage($treatment, $imageId);
        $this->deleteTreatmentImageFile($image);
        $image->delete();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.image.deleted',
            entityType: 'treatment',
            entityId: (string) $treatment->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'image_id' => (string) $image->id,
            ],
        );

        return response()->json([], 204);
    }

    private function findOwnedPatient(Request $request, string $id): Patient
    {
        return Patient::query()
            ->withTrashed()
            ->where('id', $id)
            ->where('dentist_id', $this->resolveDentistId($request))
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

    private function resolvePerPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        return min($perPage, self::MAX_PER_PAGE);
    }

    private function applySort(Builder $query, mixed $sort): void
    {
        if (! is_string($sort) || $sort === '') {
            $query->orderByDesc('treatment_date')->orderByDesc('created_at');

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
            $query->orderByDesc('treatment_date')->orderByDesc('created_at');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function transformTreatment(Treatment $treatment, bool $includeImages = true): array
    {
        $teeth = array_values(array_map(
            static fn (mixed $tooth): int => (int) $tooth,
            array_filter($treatment->teeth ?? [], static fn (mixed $tooth): bool => $tooth !== null && $tooth !== '')
        ));
        $debtAmount = $treatment->debt_amount !== null ? (float) $treatment->debt_amount : (float) ($treatment->cost ?? 0);
        $paidAmount = $treatment->paid_amount !== null ? (float) $treatment->paid_amount : 0.0;

        if ($includeImages) {
            $treatment->loadMissing('images');
        } else {
            $treatment->loadMissing('primaryImage');
        }

        $imageCount = (int) ($treatment->images_count ?? ($includeImages ? $treatment->images->count() : 0));
        $primaryImage = $includeImages
            ? $treatment->images->first()
            : ($treatment->relationLoaded('primaryImage') ? $treatment->primaryImage : null);

        return [
            'id' => (string) $treatment->id,
            'patient_id' => (string) $treatment->patient_id,
            'tooth_number' => $treatment->tooth_number,
            'teeth' => $teeth,
            'treatment_type' => $treatment->treatment_type,
            'description' => $treatment->description,
            'comment' => $treatment->comment,
            'treatment_date' => $treatment->treatment_date?->toDateString(),
            'cost' => $debtAmount,
            'debt_amount' => $debtAmount,
            'paid_amount' => $paidAmount,
            'balance' => round($debtAmount - $paidAmount, 2),
            'notes' => $treatment->notes,
            'image_count' => $imageCount,
            'primary_image' => $primaryImage instanceof TreatmentImage
                ? $this->transformTreatmentImage($treatment, $primaryImage)
                : null,
            'images' => $includeImages
                ? $treatment->images
                    ->map(fn (TreatmentImage $image): array => $this->transformTreatmentImage($treatment, $image))
                    ->values()
                    ->all()
                : [],
            'created_at' => $treatment->created_at?->toIso8601String(),
            'updated_at' => $treatment->updated_at?->toIso8601String(),
            'patient_name' => $treatment->relationLoaded('patient') ? $treatment->patient?->full_name : null,
            'patient_phone' => $treatment->relationLoaded('patient') ? $treatment->patient?->phone : null,
            'patient_secondary_phone' => $treatment->relationLoaded('patient') ? $treatment->patient?->secondary_phone : null,
            'patient_code' => $treatment->relationLoaded('patient') ? $treatment->patient?->patient_id : null,
        ];
    }

    /**
     * @param array<string, mixed> $validated
     * @return array<string, mixed>
     */
    private function buildTreatmentPayload(array $validated): array
    {
        $teeth = $this->normalizeTeeth($validated['teeth'] ?? null, $validated['tooth_number'] ?? null);
        $primaryTooth = $validated['tooth_number'] ?? ($teeth[0] ?? null);
        $debtAmount = array_key_exists('debt_amount', $validated)
            ? (float) $validated['debt_amount']
            : (array_key_exists('cost', $validated) ? (float) $validated['cost'] : 0.0);
        $paidAmount = array_key_exists('paid_amount', $validated)
            ? (float) $validated['paid_amount']
            : 0.0;

        return [
            'tooth_number' => $primaryTooth !== null ? (int) $primaryTooth : null,
            'teeth' => $teeth !== [] ? $teeth : null,
            'treatment_type' => $validated['treatment_type'],
            'description' => $validated['description'] ?? null,
            'comment' => $validated['comment'] ?? ($validated['notes'] ?? null),
            'treatment_date' => $validated['treatment_date'],
            'cost' => number_format($debtAmount, 2, '.', ''),
            'debt_amount' => number_format($debtAmount, 2, '.', ''),
            'paid_amount' => number_format($paidAmount, 2, '.', ''),
            'notes' => $validated['notes'] ?? null,
        ];
    }

    /**
     * @param mixed $teethInput
     * @return list<int>
     */
    private function normalizeTeeth(mixed $teethInput, mixed $fallbackTooth): array
    {
        $teeth = [];

        if (is_array($teethInput)) {
            foreach ($teethInput as $tooth) {
                if ($tooth === null || $tooth === '') {
                    continue;
                }

                $teeth[] = (int) $tooth;
            }
        }

        if ($teeth === [] && $fallbackTooth !== null && $fallbackTooth !== '') {
            $teeth[] = (int) $fallbackTooth;
        }

        $teeth = array_values(array_unique(array_filter(
            $teeth,
            static fn (int $tooth): bool => $tooth >= 1 && $tooth <= 32
        )));

        sort($teeth);

        return $teeth;
    }

    private function findOwnedTreatment(Request $request, string $patientId, string $treatmentId): Treatment
    {
        return Treatment::query()
            ->where('id', $treatmentId)
            ->where('patient_id', $patientId)
            ->where('dentist_id', $this->resolveDentistId($request))
            ->firstOrFail();
    }

    private function findOwnedTreatmentImage(Treatment $treatment, string $imageId): TreatmentImage
    {
        return TreatmentImage::query()
            ->where('id', $imageId)
            ->where('treatment_id', $treatment->id)
            ->where('dentist_id', $treatment->dentist_id)
            ->firstOrFail();
    }

    private function findOwnedTreatmentImageForMedia(
        Request $request,
        string $patientId,
        string $treatmentId,
        string $imageId
    ): TreatmentImage {
        $dentistId = $this->resolveDentistId($request);

        return TreatmentImage::query()
            ->where('id', $imageId)
            ->where('dentist_id', $dentistId)
            ->whereHas('treatment', function (Builder $query) use ($dentistId, $patientId, $treatmentId): void {
                $query
                    ->where('id', $treatmentId)
                    ->where('patient_id', $patientId)
                    ->where('dentist_id', $dentistId);
            })
            ->firstOrFail();
    }

    private function storeTreatmentImage(Request $request, Patient $patient, Treatment $treatment, UploadedFile $uploadedFile): string
    {
        $extension = strtolower($uploadedFile->getClientOriginalExtension() ?: $uploadedFile->extension() ?: 'jpg');
        $disk = $this->mediaDisk();
        $storagePath = $this->buildTreatmentImageStoragePath(
            dentistId: $this->resolveDentistId($request),
            patientId: (string) $patient->id,
            treatmentId: (string) $treatment->id,
            extension: $extension,
        );
        $path = $uploadedFile->storeAs(
            dirname($storagePath),
            basename($storagePath),
            [
                'disk' => $disk,
            ]
        );

        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages([
                'image' => [__('api.treatments.image_store_failed')],
            ]);
        }

        MediaPathCache::markPresent($disk, $path);
        $this->queueTreatmentImageVariants($disk, $path);

        return $path;
    }

    private function deleteTreatmentImageFile(TreatmentImage $image): void
    {
        $disk = trim((string) $image->disk);
        $path = trim((string) $image->path);
        if ($disk !== '' && $path !== '') {
            DeleteStoredMediaPaths::dispatch(
                disk: $disk,
                paths: $this->buildTreatmentImageDeletePaths($path),
                logContext: 'Treatment image'
            );
        }
    }

    private function deleteAllTreatmentImages(Treatment $treatment): void
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
            array_push($pathsByDisk[$disk], ...$this->buildTreatmentImageDeletePaths($path));
        }

        foreach ($pathsByDisk as $disk => $paths) {
            DeleteStoredMediaPaths::dispatch(
                disk: $disk,
                paths: array_values(array_unique($paths)),
                logContext: 'Treatment image batch'
            );
        }

        TreatmentImage::query()
            ->whereIn('id', $imageIds)
            ->delete();
    }

    /**
     * @return array<string, int|string|null>
     */
    private function transformTreatmentImage(Treatment $treatment, TreatmentImage $image): array
    {
        $disk = trim((string) $image->disk) !== '' ? trim((string) $image->disk) : $this->mediaDisk();
        $originalPath = trim((string) $image->path);
        $thumbnailPath = $this->buildTreatmentImageVariantPath($originalPath, self::IMAGE_VARIANT_THUMBNAIL);
        $previewPath = $this->buildTreatmentImageVariantPath($originalPath, self::IMAGE_VARIANT_PREVIEW);

        $thumbnailReady = $this->mediaPathExists($disk, $thumbnailPath);
        $previewReady = $this->mediaPathExists($disk, $previewPath);

        return [
            'id' => (string) $image->id,
            'mime_type' => $image->mime_type,
            'file_size' => (int) $image->file_size,
            'created_at' => $image->created_at?->toIso8601String(),
            'url' => $this->buildTreatmentImageUrl($treatment, $image),
            'thumbnail_url' => $this->buildTreatmentImageUrl(
                $treatment,
                $image,
                self::IMAGE_VARIANT_THUMBNAIL,
                $thumbnailReady,
                $previewReady
            ),
            'preview_url' => $this->buildTreatmentImageUrl(
                $treatment,
                $image,
                self::IMAGE_VARIANT_PREVIEW,
                $thumbnailReady,
                $previewReady
            ),
            'thumbnail_ready' => $thumbnailReady,
            'preview_ready' => $previewReady,
        ];
    }

    private function buildTreatmentImageUrl(
        Treatment $treatment,
        TreatmentImage $image,
        ?string $variant = null,
        ?bool $thumbnailReady = null,
        ?bool $previewReady = null
    ): ?string
    {
        $disk = trim((string) $image->disk) !== '' ? trim((string) $image->disk) : $this->mediaDisk();
        $path = trim((string) $image->path);

        $apiUrl = url(sprintf(
            '/api/v1/patients/%s/treatments/%s/images/%s',
            (string) $treatment->patient_id,
            (string) $treatment->id,
            (string) $image->id
        ));

        if ($variant === null) {
            $temporaryUrl = $this->buildTemporaryMediaUrl(
                $disk,
                $path,
                now()->addMinutes(10),
                $image->mime_type
            );

            return $temporaryUrl ?? $apiUrl;
        }

        if ($variant === self::IMAGE_VARIANT_THUMBNAIL) {
            $thumbnailReady ??= $this->mediaPathExists(
                $disk,
                $this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_THUMBNAIL)
            );
            $previewReady ??= $this->mediaPathExists(
                $disk,
                $this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_PREVIEW)
            );

            if ($thumbnailReady) {
                return $this->buildTemporaryMediaUrl(
                    $disk,
                    $this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_THUMBNAIL),
                    now()->addMinutes(10),
                    $this->guessImageMimeType($this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_THUMBNAIL))
                ) ?? ($apiUrl.'?variant='.self::IMAGE_VARIANT_THUMBNAIL);
            }

            if ($previewReady) {
                return $this->buildTemporaryMediaUrl(
                    $disk,
                    $this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_PREVIEW),
                    now()->addMinutes(10),
                    $this->guessImageMimeType($this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_PREVIEW))
                ) ?? ($apiUrl.'?variant='.self::IMAGE_VARIANT_PREVIEW);
            }

            return null;
        }

        if ($variant === self::IMAGE_VARIANT_PREVIEW) {
            $previewReady ??= $this->mediaPathExists(
                $disk,
                $this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_PREVIEW)
            );

            if ($previewReady) {
                return $this->buildTemporaryMediaUrl(
                    $disk,
                    $this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_PREVIEW),
                    now()->addMinutes(10),
                    $this->guessImageMimeType($this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_PREVIEW))
                ) ?? ($apiUrl.'?variant='.self::IMAGE_VARIANT_PREVIEW);
            }

            return $this->buildTemporaryMediaUrl(
                $disk,
                $path,
                now()->addMinutes(10),
                $image->mime_type
            ) ?? $apiUrl;
        }

        return $apiUrl.'?variant='.$variant;
    }

    private function resolveTreatmentImagePath(string $path, ?string $variant): string
    {
        if ($variant === null) {
            return $path;
        }

        if (! array_key_exists($variant, self::IMAGE_VARIANT_MAX_EDGES)) {
            abort(404);
        }

        return $this->buildTreatmentImageVariantPath($path, $variant);
    }

    private function buildTreatmentImageVariantPath(string $path, string $variant): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        return sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension);
    }

    /**
     * @return array<string, array{path: string, max_edge: int}>
     */
    private function buildTreatmentImageVariantDefinitions(string $path): array
    {
        $variants = [];

        foreach (self::IMAGE_VARIANT_MAX_EDGES as $variant => $maxEdge) {
            $variants[$variant] = [
                'path' => $this->buildTreatmentImageVariantPath($path, $variant),
                'max_edge' => $maxEdge,
            ];
        }

        return $variants;
    }

    private function queueTreatmentImageVariants(string $disk, string $path): void
    {
        foreach ($this->buildTreatmentImageVariantDefinitions($path) as $variantConfig) {
            MediaPathCache::markMissing($disk, (string) $variantConfig['path']);
        }

        GenerateMediaVariants::dispatch(
            disk: $disk,
            sourcePath: $path,
            variants: $this->buildTreatmentImageVariantDefinitions($path),
            logContext: 'Treatment image',
            jpegQuality: self::JPEG_VARIANT_QUALITY,
            webpQuality: self::WEBP_VARIANT_QUALITY,
        );
    }

    private function streamTreatmentImageVariant(string $disk, string $path, string $variant): ?StreamedResponse
    {
        $variantPath = $this->resolveTreatmentImagePath($path, $variant);
        if (Storage::disk($disk)->exists($variantPath)) {
            return $this->streamStoredTreatmentImage($disk, $variantPath, $this->guessImageMimeType($variantPath));
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
                'Cache-Control' => $this->imageCacheControlHeader(),
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Treatment image variant streaming failed.', [
                'exception' => $exception::class,
                'variant' => $variant,
            ]);

            return null;
        }
    }

    private function streamStoredTreatmentImage(string $disk, string $path, ?string $fallbackMimeType = null): StreamedResponse
    {
        return Storage::disk($disk)->response(
            $path,
            basename($path),
            [
                'Content-Type' => $this->guessImageMimeType($path, $fallbackMimeType),
                'Cache-Control' => $this->imageCacheControlHeader(),
            ]
        );
    }

    /**
     * @return list<string>
     */
    private function buildTreatmentImageDeletePaths(string $path): array
    {
        return [
            $path,
            $this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_THUMBNAIL),
            $this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_PREVIEW),
        ];
    }

    private function shouldIncludeImages(Request $request): bool
    {
        $includeImages = $request->query('include_images');

        if (is_string($includeImages)) {
            return ! in_array(strtolower($includeImages), ['0', 'false', 'no', 'off'], true);
        }

        if (is_bool($includeImages)) {
            return $includeImages;
        }

        if (is_numeric($includeImages)) {
            return (int) $includeImages !== 0;
        }

        return true;
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

    private function mediaDisk(): string
    {
        return (string) config('filesystems.media_disk', 'local');
    }

    private function mediaDiskSupportsDirectUpload(string $disk): bool
    {
        return (string) config("filesystems.disks.{$disk}.driver") === 's3';
    }

    private function mediaPathExists(string $disk, string $path): bool
    {
        $cached = MediaPathCache::get($disk, $path);
        if ($cached !== null) {
            return $cached;
        }

        $exists = Storage::disk($disk)->exists($path);
        if ($exists) {
            MediaPathCache::markPresent($disk, $path);
        } else {
            MediaPathCache::markMissing($disk, $path);
        }

        return $exists;
    }

    private function buildTemporaryMediaUrl(
        string $disk,
        string $path,
        \DateTimeInterface $expiresAt,
        ?string $fallbackMimeType = null
    ): ?string {
        if ($disk === '' || $path === '' || ! $this->mediaDiskSupportsDirectUpload($disk)) {
            return null;
        }

        try {
            return Storage::disk($disk)->temporaryUrl(
                $path,
                $expiresAt,
                [
                    'ResponseContentType' => $this->guessImageMimeType($path, $fallbackMimeType),
                ]
            );
        } catch (\Throwable) {
            return null;
        }
    }

    private function directUploadCacheKey(string $uploadId): string
    {
        return "treatment-image-upload:{$uploadId}";
    }

    private function buildTreatmentImageStoragePath(
        int $dentistId,
        string $patientId,
        string $treatmentId,
        string $extension
    ): string {
        return sprintf(
            'treatments/%d/%s/%s/%s.%s',
            $dentistId,
            $patientId,
            $treatmentId,
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

    private function deleteDirectUploadObject(string $disk, string $path): void
    {
        if ($disk === '' || $path === '') {
            return;
        }

        try {
            Storage::disk($disk)->delete($path);
            MediaPathCache::forgetPaths($disk, [$path]);
        } catch (\Throwable $exception) {
            Log::warning('Direct upload cleanup failed.', [
                'exception' => $exception::class,
                'disk' => $disk,
            ]);
        }
    }

    private function treatmentMessage(string $key, string $fallback): string
    {
        $translationKey = "api.treatments.{$key}";

        return Lang::has($translationKey) ? __($translationKey) : $fallback;
    }
}
