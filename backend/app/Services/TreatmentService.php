<?php

namespace App\Services;

use App\Http\Requests\ListTreatmentsRequest;
use App\Http\Requests\StoreTreatmentRequest;
use App\Http\Requests\UpdateTreatmentRequest;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TreatmentService
{
    private const DEFAULT_PER_PAGE = 15;

    private const MAX_PER_PAGE = 500;

    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly TreatmentImageService $images,
    ) {}

    /**
     * @return array{
     *     patient: Patient,
     *     treatments: LengthAwarePaginator,
     *     include_images: bool,
     *     summary: array{total_count: int, total_debt: float, total_paid: float, total_balance: float, totals_by_currency: array<string, array{total_debt: float, total_paid: float, total_balance: float}>}|null
     * }
     */
    public function listForPatient(Request $request, string $patientId): array
    {
        $patient = $this->ownedPatient($request, $patientId);
        $includeImages = $this->includeImages($request);

        $baseQuery = Treatment::query()
            ->where('dentist_id', $this->dentistId($request))
            ->where('patient_id', $patient->id);

        $summaryQuery = clone $baseQuery;
        $query = clone $baseQuery;
        $query
            ->with([
                'createdBy:id,name,role',
                'updatedBy:id,name,role',
            ])
            ->withCount('images');

        if ($includeImages) {
            $query->with('images');
        } else {
            $query->with('primaryImage');
        }

        $this->applySort($query, $request->query('sort', '-treatment_date,-created_at'));
        $treatments = $query->paginate($this->perPage($request));
        $summary = null;

        if ($this->includeSummary($request) && $this->canViewFinancials($request)) {
            $summary = $this->summaryForQuery($summaryQuery, $treatments->total());
        }

        return [
            'patient' => $patient,
            'treatments' => $treatments,
            'include_images' => $includeImages,
            'summary' => $summary,
        ];
    }

    public function show(Request $request, string $patientId, string $treatmentId): Treatment
    {
        $patient = $this->ownedPatient($request, $patientId);
        $treatment = $this->ownedTreatment($request, (string) $patient->id, $treatmentId);
        $treatment->load([
            'images',
            'createdBy:id,name,role',
            'updatedBy:id,name,role',
        ]);

        return $treatment;
    }

    public function create(StoreTreatmentRequest $request, string $patientId): Treatment
    {
        $patient = $this->ownedPatient($request, $patientId);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_add')],
            ]);
        }

        $actorId = $this->actorId($request);
        $dentistId = $this->dentistId($request);
        $treatment = DB::transaction(function () use ($request, $patient, $actorId, $dentistId): Treatment {
            $created = Treatment::query()->create([
                ...$this->payload($request->validated(), $request->user(), true),
                'dentist_id' => $dentistId,
                'created_by_user_id' => $actorId,
                'updated_by_user_id' => $actorId,
                'patient_id' => $patient->id,
            ]);
            $this->markPatientWorked($patient);

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'patient.treatment.created',
                entityType: 'treatment',
                entityId: (string) $created->id,
                // Do not duplicate clinical or financial content in audit
                // metadata. The entity row remains the source of truth.
                metadata: ['patient_id' => (string) $patient->id],
            );

            return $created;
        });

        return $treatment->load([
            'createdBy:id,name,role',
            'updatedBy:id,name,role',
        ]);
    }

    public function update(UpdateTreatmentRequest $request, string $patientId, string $treatmentId): Treatment
    {
        $patient = $this->ownedPatient($request, $patientId);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_edit')],
            ]);
        }

        $payload = $this->payload($request->validated(), $request->user(), false);
        $patientIdValue = (string) $patient->id;
        $dentistId = $this->dentistId($request);
        $actorId = $this->actorId($request);

        // Lock the treatment row before mutating so two concurrent edits
        // (dentist on web + assistant on mobile, or two browser tabs)
        // serialise on the financial columns. Without the lock, last-write
        // wins on cost/debt/paid and the loser's calculation overwrites the
        // winner's commit.
        $treatment = DB::transaction(function () use ($request, $patient, $patientIdValue, $treatmentId, $dentistId, $actorId, $payload): Treatment {
            $locked = Treatment::query()
                ->where('id', $treatmentId)
                ->where('patient_id', $patientIdValue)
                ->where('dentist_id', $dentistId)
                ->lockForUpdate()
                ->firstOrFail();
            $locked->fill($payload);
            $locked->updated_by_user_id = $actorId;
            $locked->save();
            $this->markPatientWorked($patient);

            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'patient.treatment.updated',
                entityType: 'treatment',
                entityId: (string) $locked->id,
                metadata: ['patient_id' => (string) $patient->id],
            );

            return $locked->fresh()->load([
                'createdBy:id,name,role',
                'updatedBy:id,name,role',
            ]);
        });

        return $treatment;
    }

    public function delete(Request $request, string $patientId, string $treatmentId): void
    {
        $patient = $this->ownedPatient($request, $patientId);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_delete')],
            ]);
        }

        $dentistId = $this->dentistId($request);
        $patientIdValue = (string) $patient->id;

        /** @var array<string, list<string>> $deletionPlan */
        $deletionPlan = DB::transaction(function () use ($request, $patient, $patientIdValue, $treatmentId, $dentistId): array {
            $locked = Treatment::query()
                ->where('id', $treatmentId)
                ->where('patient_id', $patientIdValue)
                ->where('dentist_id', $dentistId)
                ->lockForUpdate()
                ->firstOrFail();
            $paths = $this->images->deletionPlanForTreatment($locked);

            // The FK cascade removes every treatment image row, including
            // rejected/quarantined records hidden by the display relation.
            $locked->delete();
            $this->markPatientWorked($patient);
            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'patient.treatment.deleted',
                entityType: 'treatment',
                entityId: (string) $treatmentId,
                metadata: ['patient_id' => (string) $patient->id],
            );

            return $paths;
        });

        // Physical media deletion cannot be rolled back. Schedule it only
        // after the domain row and audit event have committed together.
        $this->images->dispatchDeletionPlan($deletionPlan);
    }

    public function ownedPatient(Request $request, string $id): Patient
    {
        return Patient::query()
            ->withTrashed()
            ->where('id', $id)
            ->where('dentist_id', $this->dentistId($request))
            ->firstOrFail();
    }

    public function ownedTreatment(Request $request, string $patientId, string $treatmentId): Treatment
    {
        return Treatment::query()
            ->where('id', $treatmentId)
            ->where('patient_id', $patientId)
            ->where('dentist_id', $this->dentistId($request))
            ->firstOrFail();
    }

    private function markPatientWorked(Patient $patient): void
    {
        $patient->touch();
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

    public function includeImages(Request $request): bool
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

            if (! in_array($field, ListTreatmentsRequest::ALLOWED_SORT_FIELDS, true)) {
                continue;
            }

            $query->orderBy($field, $direction);
            $applied = true;
        }

        if (! $applied) {
            $query->orderByDesc('treatment_date')->orderByDesc('created_at');
        }
    }

    private function includeSummary(Request $request): bool
    {
        $includeSummary = $request->query('include_summary');

        if (is_string($includeSummary)) {
            return in_array(strtolower($includeSummary), ['1', 'true', 'yes', 'on'], true);
        }

        if (is_bool($includeSummary)) {
            return $includeSummary;
        }

        if (is_numeric($includeSummary)) {
            return (int) $includeSummary !== 0;
        }

        return false;
    }

    private function canViewFinancials(Request $request): bool
    {
        /** @var User|null $actor */
        $actor = $request->user();

        return $actor instanceof User
            && $actor->hasPermission(User::PERMISSION_PAYMENTS_VIEW);
    }

    /**
     * @return array{total_count: int, total_debt: float, total_paid: float, total_balance: float, totals_by_currency: array<string, array{total_debt: float, total_paid: float, total_balance: float}>}
     */
    private function summaryForQuery(Builder $query, int $totalCount): array
    {
        $summaryRow = (clone $query)
            ->where(function (Builder $builder): void {
                $builder
                    ->where('currency', Treatment::CURRENCY_UZS)
                    ->orWhereNull('currency');
            })
            ->selectRaw('COALESCE(SUM(debt_amount), 0) AS total_debt, COALESCE(SUM(paid_amount), 0) AS total_paid')
            ->first();
        $totalDebt = (float) ($summaryRow?->getAttribute('total_debt') ?? 0);
        $totalPaid = (float) ($summaryRow?->getAttribute('total_paid') ?? 0);

        return [
            'total_count' => $totalCount,
            'total_debt' => $totalDebt,
            'total_paid' => $totalPaid,
            'total_balance' => $totalDebt - $totalPaid,
            'totals_by_currency' => $this->totalsByCurrency($query),
        ];
    }

    /**
     * @return array<string, array{total_debt: float, total_paid: float, total_balance: float}>
     */
    private function totalsByCurrency(Builder $query): array
    {
        $totals = [];
        foreach (Treatment::SUPPORTED_CURRENCIES as $currency) {
            $currencyQuery = clone $query;
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
                'total_balance' => $totalDebt - $totalPaid,
            ];
        }

        return $totals;
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function payload(array $validated, ?User $actor = null, bool $isCreate = false): array
    {
        $payload = [
            'treatment_type' => $validated['treatment_type'],
            'treatment_date' => $validated['treatment_date'],
        ];

        $hasToothInput = array_key_exists('teeth', $validated)
            || array_key_exists('tooth_number', $validated);
        if ($isCreate || $hasToothInput) {
            $teeth = $this->normalizeTeeth($validated['teeth'] ?? null, $validated['tooth_number'] ?? null);
            $primaryTooth = $validated['tooth_number'] ?? ($teeth[0] ?? null);
            $payload['tooth_number'] = $primaryTooth !== null ? (int) $primaryTooth : null;
            $payload['teeth'] = $teeth !== [] ? $teeth : null;
        }

        if ($isCreate || array_key_exists('description', $validated)) {
            $payload['description'] = $validated['description'] ?? null;
        }
        if ($isCreate || array_key_exists('comment', $validated) || array_key_exists('notes', $validated)) {
            $payload['comment'] = $validated['comment'] ?? ($validated['notes'] ?? null);
        }
        if ($isCreate || array_key_exists('notes', $validated)) {
            $payload['notes'] = $validated['notes'] ?? null;
        }

        // Financial writes are gated on `payments.manage`. Without this gate,
        // an assistant with `patients.manage` but no `payments.manage` would:
        //   1. Submit an update without the (hidden) debt_amount/paid_amount
        //      fields,
        //   2. Hit the array_key_exists fallback → both default to 0,
        //   3. Overwrite the dentist owner's real values to 0.
        // That's a silent data-loss bug. Omitting these keys from the
        // payload preserves the existing model values on update; on
        // create, the DB defaults take over (decimal columns default to
        // 0.00, which matches the prior behavior for the non-payments
        // user who couldn't set a price anyway).
        // Fail closed when no actor is provided (console/queue contexts
        // currently don't invoke this, but a future scheduled job that
        // does should be explicit about permissioning). The caller can
        // always pass an explicit User with the right perms when bulk
        // operations need financial writes.
        $canSetFinancials = $actor !== null
            && $actor->hasPermission(User::PERMISSION_PAYMENTS_MANAGE);
        if ($canSetFinancials) {
            if ($isCreate || array_key_exists('debt_amount', $validated) || array_key_exists('cost', $validated)) {
                $debtAmount = array_key_exists('debt_amount', $validated)
                    ? (float) $validated['debt_amount']
                    : (array_key_exists('cost', $validated) ? (float) $validated['cost'] : 0.0);

                $payload['cost'] = number_format($debtAmount, 2, '.', '');
                $payload['debt_amount'] = number_format($debtAmount, 2, '.', '');
            }

            if ($isCreate || array_key_exists('paid_amount', $validated)) {
                $paidAmount = array_key_exists('paid_amount', $validated)
                    ? (float) $validated['paid_amount']
                    : 0.0;

                $payload['paid_amount'] = number_format($paidAmount, 2, '.', '');
            }

            if (array_key_exists('currency', $validated)) {
                $payload['currency'] = strtoupper((string) $validated['currency']);
            }
        }

        return $payload;
    }

    /**
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

        if ($fallbackTooth !== null && $fallbackTooth !== '') {
            $teeth[] = (int) $fallbackTooth;
        }

        $teeth = array_values(array_unique(array_filter(
            $teeth,
            static fn (int $tooth): bool => $tooth >= 1 && $tooth <= 32
        )));

        sort($teeth);

        return $teeth;
    }
}
