<?php

namespace App\Services;

use App\Http\Requests\StoreOdontogramEntryRequest;
use App\Http\Requests\UpdateOdontogramEntryRequest;
use App\Models\OdontogramEntry;
use App\Models\Patient;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class OdontogramEntryService
{
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

    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly OdontogramImageService $images,
    ) {}

    /**
     * @return array{patient: Patient, entries: LengthAwarePaginator}
     */
    public function listForPatient(Request $request, string $patientId): array
    {
        $patient = $this->ownedPatient($request, $patientId);

        $query = OdontogramEntry::query()
            ->where('dentist_id', $this->dentistId($request))
            ->where('patient_id', $patient->id)
            ->with('images');

        $toothNumber = $request->input('filter.tooth_number');
        if (is_scalar($toothNumber) && $toothNumber !== '') {
            $query->where('tooth_number', (int) $toothNumber);
        }

        $this->applySort($query, $request->query('sort', 'tooth_number,condition_date,created_at'));

        return [
            'patient' => $patient,
            'entries' => $query->paginate($this->perPage($request)),
        ];
    }

    public function create(StoreOdontogramEntryRequest $request, string $patientId): OdontogramEntry
    {
        $patient = $this->ownedPatient($request, $patientId);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_add')],
            ]);
        }

        $entry = OdontogramEntry::query()->create([
            ...$request->validated(),
            'dentist_id' => $this->dentistId($request),
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

        return $entry->load('images');
    }

    public function update(UpdateOdontogramEntryRequest $request, string $patientId, string $entryId): OdontogramEntry
    {
        $patient = $this->ownedPatient($request, $patientId);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_edit')],
            ]);
        }

        $entry = $this->ownedEntry($request, (string) $patient->id, $entryId);
        $entry->update($request->validated());
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

        return $entry;
    }

    public function delete(Request $request, string $patientId, string $entryId): void
    {
        $patient = $this->ownedPatient($request, $patientId);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_delete')],
            ]);
        }
        $entry = $this->ownedEntry($request, (string) $patient->id, $entryId);

        if ($entry->invoiceItems()->exists()) {
            throw ValidationException::withMessages([
                'entry' => [__('api.odontogram.cannot_delete_linked_to_billing')],
            ]);
        }

        foreach ($entry->images as $image) {
            $this->images->deleteFile($image);
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
    }

    /**
     * @return array<string, mixed>
     */
    public function summary(Request $request, string $patientId): array
    {
        $patient = $this->ownedPatient($request, $patientId);
        $dentistId = $this->dentistId($request);
        $limit = $this->summaryLimit($request);

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

        return [
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
        ];
    }

    public function ownedPatient(Request $request, string $id): Patient
    {
        return Patient::query()
            ->withTrashed()
            ->where('id', $id)
            ->where('dentist_id', $this->dentistId($request))
            ->firstOrFail();
    }

    public function ownedEntry(Request $request, string $patientId, string $entryId): OdontogramEntry
    {
        return OdontogramEntry::query()
            ->where('id', $entryId)
            ->where('dentist_id', $this->dentistId($request))
            ->where('patient_id', $patientId)
            ->with('images')
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

    private function perPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        return min($perPage, self::MAX_PER_PAGE);
    }

    private function summaryLimit(Request $request): int
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
}
