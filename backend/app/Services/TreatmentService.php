<?php

namespace App\Services;

use App\Http\Requests\StoreTreatmentRequest;
use App\Http\Requests\UpdateTreatmentRequest;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class TreatmentService
{
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

    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly TreatmentImageService $images,
    ) {}

    /**
     * @return array{patient: Patient, treatments: LengthAwarePaginator, include_images: bool}
     */
    public function listForPatient(Request $request, string $patientId): array
    {
        $patient = $this->ownedPatient($request, $patientId);
        $includeImages = $this->includeImages($request);

        $query = Treatment::query()
            ->where('dentist_id', $this->dentistId($request))
            ->where('patient_id', $patient->id)
            ->withCount('images');

        if ($includeImages) {
            $query->with('images');
        } else {
            $query->with('primaryImage');
        }

        $this->applySort($query, $request->query('sort', '-treatment_date,-created_at'));

        return [
            'patient' => $patient,
            'treatments' => $query->paginate($this->perPage($request)),
            'include_images' => $includeImages,
        ];
    }

    /**
     * @return array{
     *     treatments: LengthAwarePaginator,
     *     include_images: bool,
     *     summary: array{total_count: int, total_debt: float, total_paid: float, total_balance: float}|null
     * }
     */
    public function listAll(Request $request): array
    {
        $dentistId = $this->dentistId($request);
        $includeImages = $this->includeImages($request);

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
        }

        $this->applySort($query, $request->query('sort', '-treatment_date,-created_at'));
        $treatments = $query->paginate($this->perPage($request));
        $summary = null;

        if ($this->includeSummary($request)) {
            $summaryRow = (clone $summaryQuery)
                ->selectRaw('COALESCE(SUM(debt_amount), 0) AS total_debt, COALESCE(SUM(paid_amount), 0) AS total_paid')
                ->first();
            $totalDebt = (float) ($summaryRow?->getAttribute('total_debt') ?? 0);
            $totalPaid = (float) ($summaryRow?->getAttribute('total_paid') ?? 0);

            $summary = [
                'total_count' => $treatments->total(),
                'total_debt' => $totalDebt,
                'total_paid' => $totalPaid,
                'total_balance' => $totalDebt - $totalPaid,
            ];
        }

        return [
            'treatments' => $treatments,
            'include_images' => $includeImages,
            'summary' => $summary,
        ];
    }

    public function show(Request $request, string $patientId, string $treatmentId): Treatment
    {
        $patient = $this->ownedPatient($request, $patientId);
        $treatment = $this->ownedTreatment($request, (string) $patient->id, $treatmentId);
        $treatment->load('images');

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

        $treatment = Treatment::query()->create([
            ...$this->payload($request->validated()),
            'dentist_id' => $this->dentistId($request),
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

        return $treatment;
    }

    public function update(UpdateTreatmentRequest $request, string $patientId, string $treatmentId): Treatment
    {
        $patient = $this->ownedPatient($request, $patientId);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_edit')],
            ]);
        }

        $treatment = $this->ownedTreatment($request, (string) $patient->id, $treatmentId);
        $treatment->fill($this->payload($request->validated()));
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

        $treatment = $this->ownedTreatment($request, (string) $patient->id, $treatmentId);

        $this->images->deleteAllForTreatment($treatment);
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

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function payload(array $validated): array
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
}
