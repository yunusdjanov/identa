<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePatientRequest;
use App\Http\Requests\UpdatePatientRequest;
use App\Models\Appointment;
use App\Models\Patient;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientController extends Controller
{
    private const PATIENT_PHOTO_DISK = 'local';

    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {
    }

    private const DEFAULT_PER_PAGE = 15;
    private const MAX_PER_PAGE = 100;

    /**
     * @var list<string>
     */
    private const ALLOWED_SORT_FIELDS = [
        'created_at',
        'full_name',
        'date_of_birth',
    ];

    public function index(Request $request): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);
        $perPage = $this->resolvePerPage($request);

        $query = $this->applyLastVisitAggregates(
            Patient::query()
            ->where('dentist_id', $dentistId)
            ->with(['categories:id,name,color,sort_order'])
        );

        $archivedOnly = $this->resolveBooleanFilter($request, 'filter.archived_only');
        $includeArchived = $this->resolveBooleanFilter($request, 'filter.include_archived');
        if ($archivedOnly) {
            $query->onlyTrashed();
        } elseif ($includeArchived) {
            $query->withTrashed();
        }

        $search = $request->input('filter.search');
        if (is_string($search) && $search !== '') {
            $query->where(function (Builder $builder) use ($search): void {
                $builder
                    ->where('full_name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('secondary_phone', 'like', "%{$search}%");
            });
        }

        $categoryIds = $this->resolveCategoryFilterIds($request);
        if ($categoryIds !== []) {
            $query->whereHas('categories', function (Builder $builder) use ($categoryIds, $dentistId): void {
                $builder
                    ->whereIn('patient_categories.id', $categoryIds)
                    ->where('patient_categories.dentist_id', $dentistId);
            });
        }

        $inactiveBefore = $request->input('filter.inactive_before');
        if (
            is_string($inactiveBefore)
            && $inactiveBefore !== ''
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $inactiveBefore) === 1
        ) {
            $query
                ->whereDoesntHave('appointments', function (Builder $appointments) use ($inactiveBefore): void {
                    $appointments
                        ->where('status', Appointment::STATUS_COMPLETED)
                        ->whereDate('appointment_date', '>=', $inactiveBefore);
                })
                ->whereDoesntHave('odontogramEntries', function (Builder $odontogramEntries) use ($inactiveBefore): void {
                    $odontogramEntries
                        ->whereDate('condition_date', '>=', $inactiveBefore);
                });
        }

        $this->applySort($query, $request->query('sort', '-created_at'));

        $patients = $query->paginate($perPage);

        return response()->json([
            'data' => $patients
                ->getCollection()
                ->map(fn (Patient $patient): array => $this->transformPatient($patient, $request))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $patients->currentPage(),
                    'per_page' => $patients->perPage(),
                    'total' => $patients->total(),
                    'total_pages' => $patients->lastPage(),
                ],
            ],
        ]);
    }

    public function store(StorePatientRequest $request): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);
        $validated = $request->validated();
        $patientAttributes = collect($validated)
            ->except(['category_id'])
            ->all();

        $patient = DB::transaction(function () use ($dentistId, $patientAttributes, $validated): Patient {
            $patient = Patient::create([
                ...$patientAttributes,
                'dentist_id' => $dentistId,
                'patient_id' => $this->generatePatientId($dentistId),
            ]);
            $this->syncPatientCategory($patient, $validated);

            return $patient->fresh()->load('categories:id,name,color,sort_order');
        });

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.created',
            entityType: 'patient',
            entityId: (string) $patient->id,
            metadata: [
                'patient_id' => $patient->patient_id,
            ],
        );

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ]);
    }

    public function update(UpdatePatientRequest $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.patients.archived_restore_before_edit')],
            ]);
        }

        $validated = $request->validated();
        $patientAttributes = collect($validated)
            ->except(['category_id'])
            ->all();
        $patient = DB::transaction(function () use ($patient, $patientAttributes, $validated): Patient {
            $patient->update($patientAttributes);
            $this->syncPatientCategory($patient, $validated);

            return $patient->fresh()->load('categories:id,name,color,sort_order');
        });

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.updated',
            entityType: 'patient',
            entityId: (string) $patient->id,
        );

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ]);
    }

    public function uploadPhoto(Request $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.patients.archived_restore_before_edit')],
            ]);
        }

        $validated = $request->validate([
            'photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        /** @var UploadedFile $uploadedPhoto */
        $uploadedPhoto = $validated['photo'];
        $storedPath = $uploadedPhoto->store(
            sprintf('patients/%s/%s', $patient->dentist_id, $patient->id),
            self::PATIENT_PHOTO_DISK
        );

        if (! is_string($storedPath) || $storedPath === '') {
            throw ValidationException::withMessages([
                'photo' => [__('api.patients.photo_store_failed')],
            ]);
        }

        $this->deletePatientPhotoFile($patient);
        $patient->forceFill([
            'photo_disk' => self::PATIENT_PHOTO_DISK,
            'photo_path' => $storedPath,
        ])->save();

        $patient = $this->findOwnedPatient($request, $id);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.photo.updated',
            entityType: 'patient',
            entityId: (string) $patient->id,
        );

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ]);
    }

    public function downloadPhoto(Request $request, string $id): StreamedResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        $photoPath = trim((string) $patient->photo_path);
        if ($photoPath === '') {
            abort(404);
        }

        $disk = is_string($patient->photo_disk) && $patient->photo_disk !== ''
            ? $patient->photo_disk
            : self::PATIENT_PHOTO_DISK;
        if (! Storage::disk($disk)->exists($photoPath)) {
            abort(404);
        }

        $mimeType = Storage::disk($disk)->mimeType($photoPath) ?: 'application/octet-stream';

        return Storage::disk($disk)->response(
            $photoPath,
            basename($photoPath),
            [
                'Content-Type' => $mimeType,
            ]
        );
    }

    public function deletePhoto(Request $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.patients.archived_restore_before_edit')],
            ]);
        }

        $this->deletePatientPhotoFile($patient);
        $patient->forceFill([
            'photo_disk' => null,
            'photo_path' => null,
        ])->save();

        $patient = $this->findOwnedPatient($request, $id);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.photo.deleted',
            entityType: 'patient',
            entityId: (string) $patient->id,
        );

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        $patientId = (string) $patient->id;
        if (! $patient->trashed()) {
            $patient->delete();
        }

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.archived',
            entityType: 'patient',
            entityId: $patientId,
        );

        return response()->json([], 204);
    }

    public function restore(Request $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if (! $patient->trashed()) {
            return response()->json([
                'data' => $this->transformPatient($patient, $request),
            ]);
        }

        $patient->restore();
        $restoredPatient = $this->findOwnedPatient($request, $id);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.restored',
            entityType: 'patient',
            entityId: (string) $patient->id,
        );

        return response()->json([
            'data' => $this->transformPatient($restoredPatient, $request),
        ]);
    }

    public function forceDestroy(Request $request, string $id): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if (! $patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.patients.archive_before_permanent_delete')],
            ]);
        }

        if (
            $patient->appointments()->exists()
            || $patient->invoices()->exists()
            || $patient->payments()->exists()
            || $patient->odontogramEntries()->exists()
            || $patient->treatments()->exists()
        ) {
            throw ValidationException::withMessages([
                'patient' => [__('api.patients.cannot_permanently_delete_with_records')],
            ]);
        }

        $patientId = (string) $patient->id;
        $this->deletePatientPhotoFile($patient);
        $patient->forceDelete();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.permanently_deleted',
            entityType: 'patient',
            entityId: $patientId,
        );

        return response()->json([], 204);
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
            $query->orderByDesc('created_at');

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
            $query->orderByDesc('created_at');
        }
    }

    private function findOwnedPatient(Request $request, string $id): Patient
    {
        return $this->applyLastVisitAggregates(
            Patient::query()
            ->withTrashed()
            ->where('id', $id)
            ->where('dentist_id', $this->resolveDentistId($request))
            ->with(['categories:id,name,color,sort_order'])
        )
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

    /**
     * @return array<string, mixed>
     */
    private function transformPatient(Patient $patient, ?Request $request = null): array
    {
        return [
            'id' => (string) $patient->id,
            'patient_id' => $patient->patient_id,
            'full_name' => $patient->full_name,
            'phone' => $patient->phone,
            'secondary_phone' => $patient->secondary_phone,
            'address' => $patient->address,
            'date_of_birth' => $patient->date_of_birth?->toDateString(),
            'gender' => $patient->gender,
            'medical_history' => $patient->medical_history,
            'allergies' => $patient->allergies,
            'current_medications' => $patient->current_medications,
            'photo_url' => $this->resolvePatientPhotoUrl($patient, $request),
            'created_at' => $patient->created_at?->toIso8601String(),
            'is_archived' => $patient->trashed(),
            'archived_at' => $patient->deleted_at?->toIso8601String(),
            'last_visit_at' => $this->resolveLastVisitAt($patient),
            'categories' => $patient->categories
                ->sortBy('sort_order')
                ->values()
                ->map(fn ($category): array => [
                    'id' => (string) $category->id,
                    'name' => $category->name,
                    'color' => $category->color,
                    'sort_order' => (int) $category->sort_order,
                ])
                ->all(),
        ];
    }

    private function resolvePatientPhotoUrl(Patient $patient, ?Request $request = null): ?string
    {
        if (! is_string($patient->photo_path) || $patient->photo_path === '') {
            return null;
        }

        $baseUrl = $request !== null
            ? $request->getSchemeAndHttpHost()
            : rtrim((string) config('app.url'), '/');
        $version = (string) ($patient->updated_at?->getTimestamp() ?? 0);

        return sprintf('%s/api/v1/patients/%s/photo?v=%s', $baseUrl, $patient->id, $version);
    }

    private function applyLastVisitAggregates(Builder $query): Builder
    {
        return $query
            ->withMax(
                ['appointments as last_completed_appointment_at' => function (Builder $builder): void {
                    $builder->where('status', Appointment::STATUS_COMPLETED);
                }],
                'appointment_date'
            )
            ->withMax('odontogramEntries as last_odontogram_visit_at', 'condition_date');
    }

    private function resolveLastVisitAt(Patient $patient): ?string
    {
        $lastCompletedAppointmentAt = $this->normalizeDateValue($patient->getAttribute('last_completed_appointment_at'));
        $lastOdontogramVisitAt = $this->normalizeDateValue($patient->getAttribute('last_odontogram_visit_at'));

        if ($lastCompletedAppointmentAt === null) {
            return $lastOdontogramVisitAt;
        }
        if ($lastOdontogramVisitAt === null) {
            return $lastCompletedAppointmentAt;
        }

        return max($lastCompletedAppointmentAt, $lastOdontogramVisitAt);
    }

    private function normalizeDateValue(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $normalized = substr((string) $value, 0, 10);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $normalized) !== 1) {
            return null;
        }

        return $normalized;
    }

    private function resolveBooleanFilter(Request $request, string $key): bool
    {
        $value = $request->input($key);
        if (is_bool($value)) {
            return $value;
        }
        if (! is_string($value)) {
            return false;
        }

        $normalized = strtolower(trim($value));

        return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
    }

    /**
     * @return list<string>
     */
    private function resolveCategoryFilterIds(Request $request): array
    {
        $singleCategoryId = $request->input('filter.category_id');
        if (is_string($singleCategoryId) && $singleCategoryId !== '') {
            return [$singleCategoryId];
        }

        $value = $request->input('filter.category_ids');
        if (is_array($value)) {
            return array_values(array_filter($value, fn ($id): bool => is_string($id) && $id !== ''));
        }

        if (is_string($value) && $value !== '') {
            return array_values(
                array_filter(
                    array_map('trim', explode(',', $value)),
                    fn (string $id): bool => $id !== ''
                )
            );
        }

        return [];
    }

    /**
     * @param array<string, mixed> $validated
     */
    private function syncPatientCategory(Patient $patient, array $validated): void
    {
        if (! array_key_exists('category_id', $validated)) {
            return;
        }

        $categoryId = $validated['category_id'];
        if (! is_string($categoryId) || $categoryId === '') {
            $patient->categories()->sync([]);

            return;
        }

        $patient->categories()->sync([$categoryId]);
    }

    private function deletePatientPhotoFile(Patient $patient): void
    {
        if (! is_string($patient->photo_path) || $patient->photo_path === '') {
            return;
        }

        $disk = is_string($patient->photo_disk) && $patient->photo_disk !== ''
            ? $patient->photo_disk
            : self::PATIENT_PHOTO_DISK;
        if (Storage::disk($disk)->exists($patient->photo_path)) {
            Storage::disk($disk)->delete($patient->photo_path);
        }
    }

    private function generatePatientId(int $dentistId): string
    {
        do {
            $numericPart = str_pad((string) random_int(0, 9999), 4, '0', STR_PAD_LEFT);
            $suffix = chr(random_int(65, 90)).chr(random_int(65, 90));
            $candidate = "PT-{$numericPart}{$suffix}";
        } while (
            Patient::query()
                ->where('dentist_id', $dentistId)
                ->where('patient_id', $candidate)
                ->exists()
        );

        return $candidate;
    }
}
