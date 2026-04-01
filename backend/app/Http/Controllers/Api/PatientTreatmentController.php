<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTreatmentRequest;
use App\Http\Requests\UpdateTreatmentRequest;
use App\Http\Requests\UploadTreatmentImageRequest;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientTreatmentController extends Controller
{
    private const IMAGE_DISK = 'local';
    private const IMAGE_SLOTS = ['before', 'after'];

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
            ->where('patient_id', $patient->id);

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
            ->with('patient:id,full_name,phone,secondary_phone,patient_id');

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
        $this->deleteTreatmentImageFile($treatment, 'before');
        $this->deleteTreatmentImageFile($treatment, 'after');
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

    public function uploadImage(UploadTreatmentImageRequest $request, string $id, string $treatmentId, string $slot): JsonResponse
    {
        $slot = $this->normalizeImageSlot($slot);
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

        $path = $this->storeTreatmentImage($request, $patient, $treatment, $slot, $uploadedFile);
        $this->deleteTreatmentImageFile($treatment, $slot);
        $this->applyTreatmentImage($treatment, $slot, self::IMAGE_DISK, $path);
        $treatment->save();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.image.uploaded',
            entityType: 'treatment',
            entityId: (string) $treatment->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'slot' => $slot,
            ],
        );

        return response()->json([
            'data' => $this->transformTreatment($treatment->fresh()),
        ]);
    }

    public function downloadImage(Request $request, string $id, string $treatmentId, string $slot): StreamedResponse
    {
        $slot = $this->normalizeImageSlot($slot);
        $patient = $this->findOwnedPatient($request, $id);
        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);

        $disk = (string) $treatment->getAttribute("{$slot}_image_disk");
        $path = (string) $treatment->getAttribute("{$slot}_image_path");
        if ($disk === '' || $path === '' || ! Storage::disk($disk)->exists($path)) {
            abort(404);
        }

        return Storage::disk($disk)->response(
            $path,
            basename($path),
            [
                'Content-Type' => Storage::disk($disk)->mimeType($path) ?: 'application/octet-stream',
                'Cache-Control' => 'private, max-age=300',
            ]
        );
    }

    public function deleteImage(Request $request, string $id, string $treatmentId, string $slot): JsonResponse
    {
        $slot = $this->normalizeImageSlot($slot);
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_delete_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $this->deleteTreatmentImageFile($treatment, $slot);
        $this->applyTreatmentImage($treatment, $slot, null, null);
        $treatment->save();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.image.deleted',
            entityType: 'treatment',
            entityId: (string) $treatment->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'slot' => $slot,
            ],
        );

        return response()->json([
            'data' => $this->transformTreatment($treatment->fresh()),
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
            'before_image_url' => $this->buildTreatmentImageUrl($treatment, 'before'),
            'after_image_url' => $this->buildTreatmentImageUrl($treatment, 'after'),
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

    private function normalizeImageSlot(string $slot): string
    {
        if (! in_array($slot, self::IMAGE_SLOTS, true)) {
            abort(404);
        }

        return $slot;
    }

    private function storeTreatmentImage(Request $request, Patient $patient, Treatment $treatment, string $slot, UploadedFile $uploadedFile): string
    {
        $extension = strtolower($uploadedFile->getClientOriginalExtension() ?: $uploadedFile->extension() ?: 'jpg');
        $directory = sprintf(
            'treatments/%d/%s/%s',
            $this->resolveDentistId($request),
            (string) $patient->id,
            (string) $treatment->id
        );
        $filename = sprintf('%s-%s.%s', $slot, Str::uuid()->toString(), $extension);
        $path = $uploadedFile->storeAs($directory, $filename, [
            'disk' => self::IMAGE_DISK,
        ]);

        if (! is_string($path) || $path === '') {
            throw ValidationException::withMessages([
                'image' => [__('api.treatments.image_store_failed')],
            ]);
        }

        return $path;
    }

    private function applyTreatmentImage(Treatment $treatment, string $slot, ?string $disk, ?string $path): void
    {
        $treatment->setAttribute("{$slot}_image_disk", $disk);
        $treatment->setAttribute("{$slot}_image_path", $path);
    }

    private function deleteTreatmentImageFile(Treatment $treatment, string $slot): void
    {
        $disk = (string) $treatment->getAttribute("{$slot}_image_disk");
        $path = (string) $treatment->getAttribute("{$slot}_image_path");
        if ($disk !== '' && $path !== '' && Storage::disk($disk)->exists($path)) {
            Storage::disk($disk)->delete($path);
        }
    }

    private function buildTreatmentImageUrl(Treatment $treatment, string $slot): ?string
    {
        $path = trim((string) $treatment->getAttribute("{$slot}_image_path"));
        if ($path === '') {
            return null;
        }

        return url(sprintf(
            '/api/v1/patients/%s/treatments/%s/images/%s',
            (string) $treatment->patient_id,
            (string) $treatment->id,
            $slot
        ));
    }
}
