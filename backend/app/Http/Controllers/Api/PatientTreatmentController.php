<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTreatmentRequest;
use App\Http\Requests\UpdateTreatmentRequest;
use App\Http\Requests\UploadTreatmentImageRequest;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientTreatmentController extends Controller
{
    private const MAX_IMAGES_PER_TREATMENT = 10;
    private const IMAGE_VARIANT_THUMBNAIL = 'thumbnail';
    private const IMAGE_VARIANT_PREVIEW = 'preview';
    private const THUMBNAIL_MAX_EDGE = 240;
    private const PREVIEW_MAX_EDGE = 1600;

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

        $query = Treatment::query()
            ->where('dentist_id', $this->resolveDentistId($request))
            ->where('patient_id', $patient->id)
            ->with('images');

        $this->applySort($query, $request->query('sort', '-treatment_date,-created_at'));

        $treatments = $query->paginate($perPage);

        return response()->json([
            'data' => $treatments
                ->getCollection()
                ->map(fn (Treatment $treatment): array => $this->transformTreatment($treatment))
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

        $query = Treatment::query()
            ->where('dentist_id', $dentistId)
            ->with([
                'patient:id,full_name,phone,secondary_phone,patient_id',
                'images',
            ]);

        $patientId = $request->input('filter.patient_id');
        if (is_string($patientId) && $patientId !== '') {
            $query->where('patient_id', $patientId);
        }

        $dateFrom = $request->input('filter.date_from');
        if (is_string($dateFrom) && $dateFrom !== '') {
            $query->whereDate('treatment_date', '>=', $dateFrom);
        }

        $dateTo = $request->input('filter.date_to');
        if (is_string($dateTo) && $dateTo !== '') {
            $query->whereDate('treatment_date', '<=', $dateTo);
        }

        $search = $request->input('filter.search');
        if (is_string($search) && trim($search) !== '') {
            $search = trim($search);
            $query->where(function (Builder $builder) use ($search): void {
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

        $this->applySort($query, $request->query('sort', '-treatment_date,-created_at'));

        $summaryQuery = clone $query;
        $treatments = $query->paginate($perPage);
        $totalCount = (clone $summaryQuery)->count();
        $totalDebt = (float) ((clone $summaryQuery)->sum('debt_amount'));
        $totalPaid = (float) ((clone $summaryQuery)->sum('paid_amount'));

        return response()->json([
            'data' => $treatments
                ->getCollection()
                ->map(fn (Treatment $treatment): array => $this->transformTreatment($treatment))
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
            'data' => $this->transformTreatment($treatment),
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
            'data' => $this->transformTreatment($treatment->fresh()),
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
            'data' => $this->transformTreatment($treatment->fresh()->load('images')),
        ]);
    }

    public function downloadImage(Request $request, string $id, string $treatmentId, string $imageId): StreamedResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $image = $this->findOwnedTreatmentImage($treatment, $imageId);

        $disk = trim((string) $image->disk);
        $path = trim((string) $image->path);
        $variant = $request->query('variant');
        $variant = is_string($variant) && $variant !== '' ? $variant : null;
        $resolvedPath = $this->resolveTreatmentImagePath($disk, $path, $variant);

        if ($disk === '' || $resolvedPath === '' || ! Storage::disk($disk)->exists($resolvedPath)) {
            abort(404);
        }

        return Storage::disk($disk)->response(
            $resolvedPath,
            basename($resolvedPath),
            [
                'Content-Type' => Storage::disk($disk)->mimeType($resolvedPath) ?: 'application/octet-stream',
                'Cache-Control' => 'private, max-age=300',
            ]
        );
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

        return response()->json([
            'data' => $this->transformTreatment($treatment->fresh()->load('images')),
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
    private function transformTreatment(Treatment $treatment): array
    {
        $treatment->loadMissing('images');

        $teeth = array_values(array_map(
            static fn (mixed $tooth): int => (int) $tooth,
            array_filter($treatment->teeth ?? [], static fn (mixed $tooth): bool => $tooth !== null && $tooth !== '')
        ));
        $debtAmount = $treatment->debt_amount !== null ? (float) $treatment->debt_amount : (float) ($treatment->cost ?? 0);
        $paidAmount = $treatment->paid_amount !== null ? (float) $treatment->paid_amount : 0.0;

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
            'images' => $treatment->images
                ->map(fn (TreatmentImage $image): array => $this->transformTreatmentImage($treatment, $image))
                ->values()
                ->all(),
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

    private function storeTreatmentImage(Request $request, Patient $patient, Treatment $treatment, UploadedFile $uploadedFile): string
    {
        $extension = strtolower($uploadedFile->getClientOriginalExtension() ?: $uploadedFile->extension() ?: 'jpg');
        $directory = sprintf(
            'treatments/%d/%s/%s',
            $this->resolveDentistId($request),
            (string) $patient->id,
            (string) $treatment->id
        );
        $filename = sprintf('%s.%s', Str::uuid()->toString(), $extension);
        $disk = $this->mediaDisk();
        $path = $uploadedFile->storeAs($directory, $filename, [
            'disk' => $disk,
        ]);

        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages([
                'image' => [__('api.treatments.image_store_failed')],
            ]);
        }

        $this->generateTreatmentImageVariants($disk, $path);

        return $path;
    }

    private function deleteTreatmentImageFile(TreatmentImage $image): void
    {
        $disk = trim((string) $image->disk);
        $path = trim((string) $image->path);
        if ($disk !== '' && $path !== '') {
            Storage::disk($disk)->delete([
                $path,
                $this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_THUMBNAIL),
                $this->buildTreatmentImageVariantPath($path, self::IMAGE_VARIANT_PREVIEW),
            ]);
        }
    }

    private function deleteAllTreatmentImages(Treatment $treatment): void
    {
        $images = $treatment->images()->get();
        foreach ($images as $image) {
            $this->deleteTreatmentImageFile($image);
            $image->delete();
        }
    }

    /**
     * @return array<string, int|string|null>
     */
    private function transformTreatmentImage(Treatment $treatment, TreatmentImage $image): array
    {
        return [
            'id' => (string) $image->id,
            'mime_type' => $image->mime_type,
            'file_size' => (int) $image->file_size,
            'created_at' => $image->created_at?->toIso8601String(),
            'url' => $this->buildTreatmentImageUrl($treatment, $image),
            'thumbnail_url' => $this->buildTreatmentImageUrl($treatment, $image, self::IMAGE_VARIANT_THUMBNAIL),
            'preview_url' => $this->buildTreatmentImageUrl($treatment, $image, self::IMAGE_VARIANT_PREVIEW),
        ];
    }

    private function buildTreatmentImageUrl(Treatment $treatment, TreatmentImage $image, ?string $variant = null): string
    {
        $url = url(sprintf(
            '/api/v1/patients/%s/treatments/%s/images/%s',
            (string) $treatment->patient_id,
            (string) $treatment->id,
            (string) $image->id
        ));

        if ($variant === null) {
            return $url;
        }

        return $url.'?variant='.$variant;
    }

    private function resolveTreatmentImagePath(string $disk, string $path, ?string $variant): string
    {
        if ($variant === null) {
            return $path;
        }

        if (! array_key_exists($variant, self::IMAGE_VARIANT_MAX_EDGES)) {
            abort(404);
        }

        $variantPath = $this->buildTreatmentImageVariantPath($path, $variant);

        return Storage::disk($disk)->exists($variantPath) ? $variantPath : $path;
    }

    private function buildTreatmentImageVariantPath(string $path, string $variant): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        return sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension);
    }

    private function generateTreatmentImageVariants(string $disk, string $path): void
    {
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagecreatetruecolor')) {
            return;
        }

        try {
            $contents = Storage::disk($disk)->get($path);
            $source = @imagecreatefromstring($contents);
            if (! is_object($source) && ! is_resource($source)) {
                return;
            }

            foreach (self::IMAGE_VARIANT_MAX_EDGES as $variant => $maxEdge) {
                $encodedVariant = $this->encodeTreatmentImageVariant($source, $path, $maxEdge);
                if ($encodedVariant === null) {
                    continue;
                }

                Storage::disk($disk)->put(
                    $this->buildTreatmentImageVariantPath($path, $variant),
                    $encodedVariant
                );
            }
        } catch (\Throwable $exception) {
            Log::warning('Treatment image variant generation failed.', [
                'exception' => $exception::class,
            ]);
        } finally {
            if (isset($source) && (is_object($source) || is_resource($source))) {
                imagedestroy($source);
            }
        }
    }

    private function encodeTreatmentImageVariant(mixed $source, string $path, int $maxEdge): ?string
    {
        $sourceWidth = imagesx($source);
        $sourceHeight = imagesy($source);
        if ($sourceWidth <= 0 || $sourceHeight <= 0) {
            return null;
        }

        $ratio = min(1, $maxEdge / max($sourceWidth, $sourceHeight));
        if ($ratio >= 1) {
            return null;
        }

        $targetWidth = max(1, (int) round($sourceWidth * $ratio));
        $targetHeight = max(1, (int) round($sourceHeight * $ratio));

        $target = imagecreatetruecolor($targetWidth, $targetHeight);
        if (! is_object($target) && ! is_resource($target)) {
            return null;
        }

        imagealphablending($target, false);
        imagesavealpha($target, true);
        imagecopyresampled($target, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $sourceWidth, $sourceHeight);

        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg');

        try {
            ob_start();
            $encoded = match ($extension) {
                'png' => imagepng($target, null, 6),
                'webp' => function_exists('imagewebp') ? imagewebp($target, null, 90) : false,
                default => imagejpeg($target, null, 90),
            };
            $contents = ob_get_clean();

            return $encoded && is_string($contents) && $contents !== '' ? $contents : null;
        } finally {
            imagedestroy($target);
        }
    }

    private function mediaDisk(): string
    {
        return (string) config('filesystems.media_disk', 'local');
    }
}
