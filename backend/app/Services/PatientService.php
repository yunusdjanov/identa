<?php

namespace App\Services;

use App\Http\Requests\StorePatientRequest;
use App\Http\Requests\UpdatePatientRequest;
use App\Jobs\DeleteStoredMediaPaths;
use App\Models\Appointment;
use App\Models\OdontogramEntry;
use App\Models\Patient;
use App\Models\PatientRecentView;
use App\Models\Treatment;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\MediaVariantPaths;
use App\Support\Search;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PatientService
{
    private const DEFAULT_PER_PAGE = 15;

    private const MAX_PER_PAGE = 100;

    private const RECENT_PATIENT_LIMIT = 5;

    /**
     * @var list<string>
     */
    private const ALLOWED_SORT_FIELDS = [
        'created_at',
        'updated_at',
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
                ->with([
                    'categories:id,name,color,sort_order',
                    'createdBy:id,name,role',
                    'updatedBy:id,name,role',
                ])
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
                })
                ->whereDoesntHave('treatments', function (Builder $treatments) use ($inactiveBefore): void {
                    $treatments
                        ->whereDate('treatment_date', '>=', $inactiveBefore);
                });
        }

        $this->applySort($query, $request->query('sort', '-updated_at'));

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

    /**
     * Return the current user's most recently opened patients inside the tenant.
     *
     * @return Collection<int, Patient>
     */
    public function recent(Request $request): Collection
    {
        $dentistId = $this->dentistId($request);
        $actorId = $this->actorId($request);

        return Patient::query()
            ->join('patient_recent_views', 'patients.id', '=', 'patient_recent_views.patient_id')
            ->where('patient_recent_views.user_id', $actorId)
            ->where('patient_recent_views.dentist_id', $dentistId)
            ->where('patients.dentist_id', $dentistId)
            ->whereNull('patients.deleted_at')
            ->orderByDesc('patient_recent_views.viewed_at')
            ->orderByDesc('patient_recent_views.id')
            ->limit(self::RECENT_PATIENT_LIMIT)
            ->get([
                'patients.id',
                'patients.full_name',
            ]);
    }

    /**
     * Store one patient detail view as a profile-scoped recent shortcut.
     */
    public function rememberRecent(Request $request, Patient $patient): void
    {
        if ($patient->trashed()) {
            return;
        }

        $dentistId = $this->dentistId($request);
        $actorId = $this->actorId($request);

        PatientRecentView::query()->updateOrCreate(
            [
                'user_id' => $actorId,
                'patient_id' => (string) $patient->id,
            ],
            [
                'dentist_id' => $dentistId,
                'viewed_at' => now(),
            ]
        );

        $latestIds = PatientRecentView::query()
            ->where('user_id', $actorId)
            ->where('dentist_id', $dentistId)
            ->orderByDesc('viewed_at')
            ->orderByDesc('id')
            ->limit(self::RECENT_PATIENT_LIMIT)
            ->pluck('id');

        if ($latestIds->isNotEmpty()) {
            PatientRecentView::query()
                ->where('user_id', $actorId)
                ->where('dentist_id', $dentistId)
                ->whereNotIn('id', $latestIds)
                ->delete();
        }
    }

    /**
     * Remove one recent-patient shortcut for the current user.
     */
    public function forgetRecent(Request $request, string $patientId): void
    {
        PatientRecentView::query()
            ->where('user_id', $this->actorId($request))
            ->where('dentist_id', $this->dentistId($request))
            ->where('patient_id', $patientId)
            ->delete();
    }

    /**
     * Clear all recent-patient shortcuts for the current user.
     */
    public function clearRecent(Request $request): void
    {
        PatientRecentView::query()
            ->where('user_id', $this->actorId($request))
            ->where('dentist_id', $this->dentistId($request))
            ->delete();
    }

    public function create(StorePatientRequest $request): Patient
    {
        $dentistId = $this->dentistId($request);
        $validated = $request->validated();
        $actorId = $this->actorId($request);
        $patientAttributes = collect($validated)
            ->except(['category_id'])
            ->all();

        $patient = DB::transaction(function () use ($dentistId, $actorId, $patientAttributes, $validated): Patient {
            $patient = Patient::create([
                ...$patientAttributes,
                'dentist_id' => $dentistId,
                'created_by_user_id' => $actorId,
                'updated_by_user_id' => $actorId,
                'patient_id' => $this->generatePatientId($dentistId),
            ]);
            $this->syncCategory($patient, $validated);

            return $patient->fresh()->load([
                'categories:id,name,color,sort_order',
                'createdBy:id,name,role',
                'updatedBy:id,name,role',
                'oralPhotos',
            ]);
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
        $validated = $request->validated();
        $patientAttributes = collect($validated)
            ->except(['category_id'])
            ->all();
        $dentistId = $this->dentistId($request);
        $actorId = $this->actorId($request);
        $archivedMessage = __('api.patients.archived_restore_before_edit');

        $patient = DB::transaction(function () use ($id, $dentistId, $actorId, $patientAttributes, $validated, $archivedMessage): Patient {
            // Lock the patient row inside the transaction so two concurrent
            // two-tab edits (or admin + assistant) serialise on the row.
            // Without the lock, syncCategory() can interleave detach/attach
            // operations and drop a category that another writer just added.
            $patient = Patient::query()
                ->withTrashed()
                ->where('id', $id)
                ->where('dentist_id', $dentistId)
                ->lockForUpdate()
                ->firstOrFail();
            $this->ensureNotArchived($patient, $archivedMessage);

            $patient->update([
                ...$patientAttributes,
                'updated_by_user_id' => $actorId,
            ]);
            $this->syncCategory($patient, $validated);

            return $patient->fresh()->load([
                'categories:id,name,color,sort_order',
                'createdBy:id,name,role',
                'updatedBy:id,name,role',
                'oralPhotos',
            ]);
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

                $visitDates = collect();
                if ($includeAppointments) {
                    $visitDates = $visitDates->merge(
                        Appointment::query()
                            ->where('dentist_id', $dentistId)
                            ->where('patient_id', $id)
                            ->where('status', Appointment::STATUS_COMPLETED)
                            ->pluck('appointment_date')
                            ->map(static fn ($date): string => substr((string) $date, 0, 10))
                    );
                }
                $visitDates = $visitDates
                    ->merge(
                        Treatment::query()
                            ->where('dentist_id', $dentistId)
                            ->where('patient_id', $id)
                            ->pluck('treatment_date')
                            ->map(static fn ($date): string => substr((string) $date, 0, 10))
                    )
                    ->merge(
                        OdontogramEntry::query()
                            ->where('dentist_id', $dentistId)
                            ->where('patient_id', $id)
                            ->pluck('condition_date')
                            ->map(static fn ($date): string => substr((string) $date, 0, 10))
                    );
                $visitCount = $visitDates
                    ->filter(static fn (string $date): bool => preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1)
                    ->unique()
                    ->count();

                $totalDebt = 0.0;
                $totalPaid = 0.0;
                $totalsByCurrency = [];
                if ($includePayments) {
                    $treatmentTotals = Treatment::query()
                        ->where('dentist_id', $dentistId)
                        ->where('patient_id', $id)
                        ->where(function (Builder $builder): void {
                            $builder
                                ->where('currency', Treatment::CURRENCY_UZS)
                                ->orWhereNull('currency');
                        })
                        ->selectRaw('COALESCE(SUM(debt_amount), 0) AS total_debt, COALESCE(SUM(paid_amount), 0) AS total_paid')
                        ->first();

                    $totalDebt = (float) ($treatmentTotals?->getAttribute('total_debt') ?? 0);
                    $totalPaid = (float) ($treatmentTotals?->getAttribute('total_paid') ?? 0);
                    $totalsByCurrency = $this->treatmentTotalsByCurrency($dentistId, $id);
                }

                return [
                    'appointment_count' => $appointmentCount,
                    'visit_count' => $visitCount,
                    'upcoming_appointments' => $upcomingAppointments,
                    'total_debt' => $totalDebt,
                    'total_paid' => $totalPaid,
                    'total_balance' => round($totalDebt - $totalPaid, 2),
                    'totals_by_currency' => $totalsByCurrency,
                ];
            }
        );
    }

    /**
     * @return array<string, array{total_debt: float, total_paid: float, total_balance: float}>
     */
    private function treatmentTotalsByCurrency(int $dentistId, string $patientId): array
    {
        $totals = [];
        foreach (Treatment::SUPPORTED_CURRENCIES as $currency) {
            $currencyQuery = Treatment::query()
                ->where('dentist_id', $dentistId)
                ->where('patient_id', $patientId);
            if ($currency === Treatment::CURRENCY_UZS) {
                $currencyQuery->where(function (Builder $builder): void {
                    $builder
                        ->where('currency', Treatment::CURRENCY_UZS)
                        ->orWhereNull('currency');
                });
            } else {
                $currencyQuery->where('currency', $currency);
            }

            $row = $currencyQuery
                ->selectRaw('COALESCE(SUM(debt_amount), 0) AS total_debt, COALESCE(SUM(paid_amount), 0) AS total_paid')
                ->first();
            $totalDebt = (float) ($row?->getAttribute('total_debt') ?? 0);
            $totalPaid = (float) ($row?->getAttribute('total_paid') ?? 0);
            $totals[$currency] = [
                'total_debt' => $totalDebt,
                'total_paid' => $totalPaid,
                'total_balance' => round($totalDebt - $totalPaid, 2),
            ];
        }

        return $totals;
    }

    public function archive(Request $request, string $id): void
    {
        $patient = $this->ownedPatient($request, $id);
        $patientId = (string) $patient->id;
        // Idempotency: already-archived patient should be a no-op — no
        // duplicate audit entry. Without this guard, a double-click on
        // the archive button writes two `patient.archived` events,
        // which clutters the audit log and confuses downstream
        // analytics. FA-X4 D1.b.
        if ($patient->trashed()) {
            return;
        }

        $patient->delete();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.archived',
            entityType: 'patient',
            entityId: $patientId,
        );
    }

    public function restore(Request $request, string $id): Patient
    {
        // Wrap in DB::transaction + lockForUpdate so two concurrent
        // restore calls (browser double-click, retried mutation) don't
        // both proceed through the `trashed()` check at the same time
        // — without the lock the second call would see the row still
        // trashed momentarily and queue another restore + audit entry.
        // FA-X4 D1.
        return DB::transaction(function () use ($request, $id): Patient {
            $dentistId = $this->dentistId($request);
            /** @var Patient $patient */
            $patient = Patient::query()
                ->withTrashed()
                ->where('dentist_id', $dentistId)
                ->where('id', $id)
                ->lockForUpdate()
                ->firstOrFail();

            if (! $patient->trashed()) {
                return $patient;
            }

            $patient->restore();

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'patient.restored',
                entityType: 'patient',
                entityId: (string) $patient->id,
            );

            return $patient;
        });
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
        $patient->clinicalPhotos()->get()->each(function ($photo) use ($collect): void {
            $collect($photo->disk, MediaVariantPaths::deletePaths($photo, (string) $photo->path));
            if (is_string($photo->quarantine_path) && trim($photo->quarantine_path) !== '') {
                $collect($photo->disk, MediaVariantPaths::deletePaths($photo, $photo->quarantine_path));
            }
        });

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
                ->with([
                    'categories:id,name,color,sort_order',
                    'createdBy:id,name,role',
                    'updatedBy:id,name,role',
                    'oralPhotos',
                ])
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

    private function actorId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        abort_if($actor === null, 403);

        return (int) $actor->id;
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
            $query
                ->orderByDesc('updated_at')
                ->orderByDesc('created_at');

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
            $query->orderByDesc('updated_at');
        }

        $query->orderByDesc('created_at');
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
            ->withMax('odontogramEntries as last_odontogram_visit_at', 'condition_date')
            ->withMax('treatments as last_treatment_visit_at', 'treatment_date');
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
