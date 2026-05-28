<?php

namespace App\Services;

use App\Http\Requests\StorePatientRequest;
use App\Http\Requests\UpdatePatientRequest;
use App\Jobs\DeleteStoredMediaPaths;
use App\Models\Appointment;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\Search;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PatientService
{
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

    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly PatientPhotoService $photos,
        private readonly OdontogramImageService $odontogramImages,
        private readonly TreatmentImageDirectUploadService $treatmentImages,
    ) {}

    public function list(Request $request): LengthAwarePaginator
    {
        $dentistId = $this->dentistId($request);

        $query = $this->withLastVisitAggregates(
            Patient::query()
                ->where('dentist_id', $dentistId)
                ->with(['categories:id,name,color,sort_order'])
        );

        $archivedOnly = $this->booleanFilter($request, 'filter.archived_only');
        $includeArchived = $this->booleanFilter($request, 'filter.include_archived');
        if ($archivedOnly) {
            $query->onlyTrashed();
        } elseif ($includeArchived) {
            $query->withTrashed();
        }

        $search = $request->input('filter.search');
        if (is_string($search) && $search !== '') {
            // Case-insensitive across Postgres (case-sensitive LIKE) and
            // MySQL/SQLite so a lowercase keyboard query like "test" matches
            // a stored "Test". See App\Support\Search for rationale.
            Search::ciLikeAny($query, ['full_name', 'phone', 'secondary_phone'], $search);
        }

        $categoryIds = $this->categoryFilterIds($request);
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

        return $query->paginate($this->perPage($request));
    }

    public function lookup(Request $request): LengthAwarePaginator
    {
        $query = Patient::query()
            ->where('dentist_id', $this->dentistId($request))
            ->orderBy('full_name');

        $patientId = $request->input('filter.id');
        if (is_string($patientId) && $patientId !== '') {
            $query->where('id', $patientId);
        }

        $search = $request->input('filter.search');
        if (is_string($search) && $search !== '') {
            Search::ciLikeAny($query, ['full_name', 'phone', 'secondary_phone'], $search);
        }

        return $query->paginate(min($this->perPage($request), 50), [
            'id',
            'patient_id',
            'full_name',
            'phone',
            'secondary_phone',
        ]);
    }

    public function create(StorePatientRequest $request): Patient
    {
        $dentistId = $this->dentistId($request);
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
            $this->syncCategory($patient, $validated);

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

        return $patient;
    }

    public function update(UpdatePatientRequest $request, string $id): Patient
    {
        $patient = $this->ownedPatient($request, $id);
        $this->ensureNotArchived($patient, __('api.patients.archived_restore_before_edit'));

        $validated = $request->validated();
        $patientAttributes = collect($validated)
            ->except(['category_id'])
            ->all();
        $patient = DB::transaction(function () use ($patient, $patientAttributes, $validated): Patient {
            $patient->update($patientAttributes);
            $this->syncCategory($patient, $validated);

            return $patient->fresh()->load('categories:id,name,color,sort_order');
        });

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.updated',
            entityType: 'patient',
            entityId: (string) $patient->id,
        );

        return $patient;
    }

    /**
     * @return array<string, mixed>
     */
    public function overview(Request $request, string $id): array
    {
        $dentistId = $this->dentistId($request);
        /** @var User|null $actor */
        $actor = $request->user();
        $includeAppointments = $actor?->hasPermission(User::PERMISSION_APPOINTMENTS_VIEW) ?? false;
        $includePayments = $actor?->hasPermission(User::PERMISSION_PAYMENTS_VIEW) ?? false;

        Patient::query()
            ->withTrashed()
            ->where('id', $id)
            ->where('dentist_id', $dentistId)
            ->firstOrFail(['id']);

        $cacheKey = sprintf(
            'patients:overview:%s:%s:%s:%s',
            $dentistId,
            $id,
            $includeAppointments ? 'appointments' : 'no-appointments',
            $includePayments ? 'payments' : 'no-payments'
        );

        return Cache::remember(
            $cacheKey,
            now()->addSeconds(10),
            function () use ($dentistId, $id, $includeAppointments, $includePayments): array {
                $appointmentCount = 0;
                $upcomingAppointments = [];
                if ($includeAppointments) {
                    $appointmentCount = (int) Appointment::query()
                        ->where('dentist_id', $dentistId)
                        ->where('patient_id', $id)
                        ->count();

                    $upcomingAppointments = Appointment::query()
                        ->where('dentist_id', $dentistId)
                        ->where('patient_id', $id)
                        ->where('status', Appointment::STATUS_SCHEDULED)
                        ->whereDate('appointment_date', '>=', today()->toDateString())
                        ->orderBy('appointment_date')
                        ->orderBy('start_time')
                        ->limit(3)
                        ->get([
                            'id',
                            'appointment_date',
                            'start_time',
                            'end_time',
                            'status',
                            'notes',
                        ])
                        ->map(static fn (Appointment $appointment): array => [
                            'id' => (string) $appointment->id,
                            'appointment_date' => $appointment->appointment_date?->toDateString(),
                            'start_time' => (string) $appointment->start_time,
                            'end_time' => (string) $appointment->end_time,
                            'status' => (string) $appointment->status,
                            'notes' => $appointment->notes,
                        ])
                        ->values()
                        ->all();
                }

                $totalDebt = 0.0;
                $totalPaid = 0.0;
                if ($includePayments) {
                    $treatmentTotals = Treatment::query()
                        ->where('dentist_id', $dentistId)
                        ->where('patient_id', $id)
                        ->selectRaw('COALESCE(SUM(debt_amount), 0) AS total_debt, COALESCE(SUM(paid_amount), 0) AS total_paid')
                        ->first();

                    $totalDebt = (float) ($treatmentTotals?->getAttribute('total_debt') ?? 0);
                    $totalPaid = (float) ($treatmentTotals?->getAttribute('total_paid') ?? 0);
                }

                return [
                    'appointment_count' => $appointmentCount,
                    'upcoming_appointments' => $upcomingAppointments,
                    'total_debt' => $totalDebt,
                    'total_paid' => $totalPaid,
                    'total_balance' => round($totalDebt - $totalPaid, 2),
                ];
            }
        );
    }

    public function archive(Request $request, string $id): void
    {
        $patient = $this->ownedPatient($request, $id);
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
    }

    public function restore(Request $request, string $id): Patient
    {
        $patient = $this->ownedPatient($request, $id);
        if (! $patient->trashed()) {
            return $patient;
        }

        $patient->restore();
        $restoredPatient = $this->ownedPatient($request, $id);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.restored',
            entityType: 'patient',
            entityId: (string) $patient->id,
        );

        return $restoredPatient;
    }

    public function forceDelete(Request $request, string $id): void
    {
        $patient = $this->ownedPatient($request, $id);
        if (! $patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.patients.archive_before_permanent_delete')],
            ]);
        }

        $patientId = (string) $patient->id;

        // Capture record counts for the audit trail before anything is removed.
        $counts = [
            'appointments' => $patient->appointments()->count(),
            'invoices' => $patient->invoices()->count(),
            'payments' => $patient->payments()->count(),
            'odontogram_entries' => $patient->odontogramEntries()->count(),
            'treatments' => $patient->treatments()->count(),
        ];

        // Gather every image file path (original + thumbnail/preview variants)
        // grouped by disk BEFORE deleting. The ON DELETE CASCADE foreign keys
        // remove the DB rows, but the underlying storage objects must be purged
        // explicitly — otherwise they orphan.
        $pathsByDisk = [];
        $collect = function (?string $disk, array $paths) use (&$pathsByDisk): void {
            $disk = trim((string) $disk);
            if ($disk === '' || $paths === []) {
                return;
            }
            $pathsByDisk[$disk] = array_merge($pathsByDisk[$disk] ?? [], $paths);
        };

        $patient->odontogramEntries()->with('images')->get()->each(
            fn ($entry) => $entry->images->each(
                fn ($image) => $collect($image->disk, $this->odontogramImages->deletePaths((string) $image->path))
            )
        );
        $patient->treatments()->with('images')->get()->each(
            fn ($treatment) => $treatment->images->each(
                fn ($image) => $collect($image->disk, $this->treatmentImages->deletePaths((string) $image->path))
            )
        );

        // Remove the patient (cascades appointments/invoices/payments/odontogram
        // entries+images/treatments+images/category links) atomically.
        DB::transaction(static function () use ($patient): void {
            $patient->forceDelete();
        });

        // Only purge storage AFTER the DB delete has committed, so a failed
        // delete never leaves the patient pointing at missing files.
        $this->photos->delete($patient);
        foreach ($pathsByDisk as $disk => $paths) {
            DeleteStoredMediaPaths::dispatch(
                disk: (string) $disk,
                paths: array_values(array_unique($paths)),
                logContext: 'Patient permanent delete'
            )->afterResponse();
        }

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.permanently_deleted',
            entityType: 'patient',
            entityId: $patientId,
            metadata: $counts,
        );
    }

    public function ownedPatient(Request $request, string $id): Patient
    {
        return $this->withLastVisitAggregates(
            Patient::query()
                ->withTrashed()
                ->where('id', $id)
                ->where('dentist_id', $this->dentistId($request))
                ->with(['categories:id,name,color,sort_order'])
        )->firstOrFail();
    }

    public function dentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }

    public function subscriptionOwner(Request $request): User
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $owner = $actor?->subscriptionOwner();
        abort_if($owner === null, 403);

        return $owner;
    }

    public function ensureNotArchived(Patient $patient, string $message): void
    {
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [$message],
            ]);
        }
    }

    private function perPage(Request $request): int
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

    private function withLastVisitAggregates(Builder $query): Builder
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

    private function booleanFilter(Request $request, string $key): bool
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
    private function categoryFilterIds(Request $request): array
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
     * @param  array<string, mixed>  $validated
     */
    private function syncCategory(Patient $patient, array $validated): void
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
