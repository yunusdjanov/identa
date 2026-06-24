<?php

namespace App\Services;

use App\Http\Requests\StoreAppointmentRequest;
use App\Http\Requests\StorePatientRequest;
use App\Http\Requests\UpdateAppointmentRequest;
use App\Models\Appointment;
use App\Models\Patient;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\Search;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AppointmentService
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {}

    private const DEFAULT_PER_PAGE = 15;

    private const MAX_PER_PAGE = 500;

    private const CONFLICT_MESSAGE_KEY = 'api.appointments.conflict';

    /**
     * @var list<string>
     */
    private const NON_BLOCKING_STATUSES = [
        Appointment::STATUS_CANCELLED,
        Appointment::STATUS_NO_SHOW,
    ];

    /**
     * @var list<string>
     */
    private const ALLOWED_SORT_FIELDS = [
        'appointment_date',
        'start_time',
        'created_at',
    ];

    /**
     * @var list<string>
     */
    private const IMMUTABLE_STATUSES = [
        Appointment::STATUS_COMPLETED,
        Appointment::STATUS_CANCELLED,
        Appointment::STATUS_NO_SHOW,
    ];

    public function list(Request $request): LengthAwarePaginator
    {
        $query = Appointment::query()
            ->where('dentist_id', $this->dentistId($request))
            ->with([
                'patient:id,full_name',
                'createdBy:id,name,role',
                'updatedBy:id,name,role',
            ]);

        $patientId = $request->input('filter.patient_id');
        if (is_string($patientId) && $patientId !== '') {
            $query->where('patient_id', $patientId);
        }

        $dateFrom = $request->input('filter.date_from');
        if (is_string($dateFrom) && $dateFrom !== '') {
            $query->whereDate('appointment_date', '>=', $dateFrom);
        }

        $dateTo = $request->input('filter.date_to');
        if (is_string($dateTo) && $dateTo !== '') {
            $query->whereDate('appointment_date', '<=', $dateTo);
        }

        $status = $request->input('filter.status');
        if (is_string($status) && $status !== '') {
            $query->where('status', $status);
        }

        $this->applySort($query, $request->query('sort', '-appointment_date,-start_time'));

        return $query->paginate($this->perPage($request));
    }

    public function lookup(Request $request): LengthAwarePaginator
    {
        $query = Appointment::query()
            ->where('dentist_id', $this->dentistId($request))
            ->with('patient:id,full_name')
            ->orderByDesc('appointment_date')
            ->orderByDesc('start_time');

        $search = $request->input('filter.search');
        if (is_string($search) && $search !== '') {
            $query->where(function (Builder $builder) use ($search): void {
                $builder->whereHas('patient', function (Builder $patientQuery) use ($search): void {
                    // Case-insensitive across all DB drivers (Postgres LIKE is
                    // case-sensitive; mobile keyboards default to lowercase).
                    Search::ciLike($patientQuery, 'full_name', $search);
                });
                Search::ciLike($builder, 'guest_name', $search, 'or');
                Search::ciLike($builder, 'guest_phone', $search, 'or');
            });
        }

        return $query->paginate(min($this->perPage($request), 50), [
            'id',
            'patient_id',
            'guest_name',
            'guest_phone',
            'appointment_date',
            'start_time',
            'status',
        ]);
    }

    public function create(StoreAppointmentRequest $request): Appointment
    {
        $validated = $request->validated();
        $dentistId = $this->dentistId($request);
        $actorId = $this->actorId($request);
        $status = $validated['status'] ?? Appointment::STATUS_SCHEDULED;

        $appointment = DB::transaction(function () use ($validated, $dentistId, $actorId, $status): Appointment {
            $this->assertNoConflict(
                dentistId: $dentistId,
                appointmentDate: $validated['appointment_date'],
                startTime: $validated['start_time'],
                endTime: $validated['end_time'],
                status: $status,
            );

            return Appointment::create([
                ...collect($validated)->except(['reason', 'patient_id', 'guest_name', 'guest_phone'])->all(),
                ...$this->identityAttributes($validated),
                'dentist_id' => $dentistId,
                'created_by_user_id' => $actorId,
                'updated_by_user_id' => $actorId,
                'status' => $status,
                'notes' => $validated['reason'] ?? null,
            ])->load([
                'patient:id,full_name',
                'createdBy:id,name,role',
                'updatedBy:id,name,role',
            ]);
        });

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'appointment.created',
            entityType: 'appointment',
            entityId: (string) $appointment->id,
            metadata: [
                'patient_id' => $appointment->patient_id !== null ? (string) $appointment->patient_id : null,
                'is_guest' => $appointment->patient_id === null,
                'appointment_date' => $appointment->appointment_date?->toDateString(),
                'status' => $appointment->status,
            ],
        );

        return $appointment;
    }

    public function update(UpdateAppointmentRequest $request, string $id): Appointment
    {
        $validated = $request->validated();
        $status = $validated['status'] ?? Appointment::STATUS_SCHEDULED;
        $dentistId = $this->dentistId($request);
        $actorId = $this->actorId($request);

        $appointment = DB::transaction(function () use ($id, $dentistId, $actorId, $validated, $status): Appointment {
            // Lock the appointment row inside the transaction so the
            // immutable-status guard below is not TOCTOU vs a concurrent
            // status transition. Otherwise two clients could both observe
            // status=scheduled, both pass the guard, and both overwrite
            // each other's mutation.
            $appointment = Appointment::query()
                ->where('id', $id)
                ->where('dentist_id', $dentistId)
                ->lockForUpdate()
                ->firstOrFail();

            if (in_array($appointment->status, self::IMMUTABLE_STATUSES, true)) {
                throw ValidationException::withMessages([
                    'status' => [__('api.appointments.finalized_cannot_be_edited')],
                ]);
            }

            $this->assertNoConflict(
                dentistId: $dentistId,
                appointmentDate: $validated['appointment_date'],
                startTime: $validated['start_time'],
                endTime: $validated['end_time'],
                status: $status,
                ignoreAppointmentId: $appointment->id,
            );

            $appointment->update([
                ...collect($validated)->except(['reason', 'patient_id', 'guest_name', 'guest_phone'])->all(),
                ...$this->identityAttributes($validated),
                'updated_by_user_id' => $actorId,
                'status' => $status,
                'notes' => $validated['reason'] ?? null,
            ]);

            return $appointment->fresh()->load([
                'patient:id,full_name',
                'createdBy:id,name,role',
                'updatedBy:id,name,role',
            ]);
        });

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'appointment.updated',
            entityType: 'appointment',
            entityId: (string) $appointment->id,
            metadata: [
                'patient_id' => $appointment->patient_id !== null ? (string) $appointment->patient_id : null,
                'is_guest' => $appointment->patient_id === null,
                'appointment_date' => $appointment->appointment_date?->toDateString(),
                'status' => $appointment->status,
            ],
        );

        return $appointment;
    }

    /**
     * @return array{appointment: Appointment, patient: Patient}
     */
    public function createPatientCardFromGuest(StorePatientRequest $request, string $id): array
    {
        $validated = $request->validated();
        $dentistId = $this->dentistId($request);
        $actorId = $this->actorId($request);
        $patientAttributes = collect($validated)
            ->except(['category_id'])
            ->all();

        $result = DB::transaction(function () use ($id, $dentistId, $actorId, $patientAttributes, $validated): array {
            $appointment = Appointment::query()
                ->where('id', $id)
                ->where('dentist_id', $dentistId)
                ->lockForUpdate()
                ->firstOrFail();

            if ($appointment->patient_id !== null) {
                throw ValidationException::withMessages([
                    'appointment' => [__('api.appointments.already_linked_to_patient')],
                ]);
            }

            $patient = Patient::create([
                ...$patientAttributes,
                'dentist_id' => $dentistId,
                'created_by_user_id' => $actorId,
                'updated_by_user_id' => $actorId,
                'patient_id' => $this->generatePatientId($dentistId),
            ]);
            $this->syncPatientCategory($patient, $validated);

            $appointment->update([
                'patient_id' => $patient->id,
                'guest_name' => null,
                'guest_phone' => null,
                'updated_by_user_id' => $actorId,
            ]);

            return [
                'appointment' => $appointment->fresh()->load([
                    'patient:id,full_name',
                    'createdBy:id,name,role',
                    'updatedBy:id,name,role',
                ]),
                'patient' => $patient->fresh()->load([
                    'categories:id,name,color,sort_order',
                    'createdBy:id,name,role',
                    'updatedBy:id,name,role',
                    'oralPhotos',
                ]),
            ];
        });

        $patient = $result['patient'];
        $appointment = $result['appointment'];

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.created',
            entityType: 'patient',
            entityId: (string) $patient->id,
            metadata: [
                'patient_id' => $patient->patient_id,
                'source' => 'guest_appointment',
                'appointment_id' => (string) $appointment->id,
            ],
        );
        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'appointment.updated',
            entityType: 'appointment',
            entityId: (string) $appointment->id,
            metadata: [
                'patient_id' => (string) $appointment->patient_id,
                'is_guest' => false,
                'appointment_date' => $appointment->appointment_date?->toDateString(),
                'status' => $appointment->status,
                'source' => 'guest_appointment_patient_card',
            ],
        );

        return $result;
    }

    public function delete(Request $request, string $id): void
    {
        $appointment = $this->ownedAppointment($request, $id);
        $metadata = [
            'patient_id' => $appointment->patient_id !== null ? (string) $appointment->patient_id : null,
            'is_guest' => $appointment->patient_id === null,
            'appointment_date' => $appointment->appointment_date?->toDateString(),
            'status' => $appointment->status,
        ];
        $appointment->delete();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'appointment.deleted',
            entityType: 'appointment',
            entityId: (string) $appointment->id,
            metadata: $metadata,
        );
    }

    public function ownedAppointment(Request $request, string $id): Appointment
    {
        return Appointment::query()
            ->where('id', $id)
            ->where('dentist_id', $this->dentistId($request))
            ->with([
                'patient:id,full_name',
                'createdBy:id,name,role',
                'updatedBy:id,name,role',
            ])
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

    private function actorId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        abort_if($actor === null, 403);

        return (int) $actor->id;
    }

    private function assertNoConflict(
        int $dentistId,
        string $appointmentDate,
        string $startTime,
        string $endTime,
        string $status,
        ?string $ignoreAppointmentId = null,
    ): void {
        if (in_array($status, self::NON_BLOCKING_STATUSES, true)) {
            return;
        }

        $requestedStartMinutes = $this->minutesFromClock($startTime);
        $requestedEndMinutes = $this->minutesFromClock($endTime);
        $query = Appointment::query()
            ->where('dentist_id', $dentistId)
            ->whereDate('appointment_date', $appointmentDate)
            ->whereNotIn('status', self::NON_BLOCKING_STATUSES)
            ->lockForUpdate();

        if ($ignoreAppointmentId !== null) {
            $query->where('id', '!=', $ignoreAppointmentId);
        }

        $hasConflict = $query
            ->get(['id', 'start_time', 'end_time'])
            ->contains(
                fn (Appointment $appointment): bool => $this->minutesFromClock((string) $appointment->start_time) < $requestedEndMinutes
                    && $this->minutesFromClock((string) $appointment->end_time) > $requestedStartMinutes
            );

        if ($hasConflict) {
            throw ValidationException::withMessages([
                'start_time' => [__(self::CONFLICT_MESSAGE_KEY)],
            ]);
        }
    }

    private function minutesFromClock(string $value): int
    {
        [$hour, $minute] = array_pad(explode(':', $value), 2, 0);

        return ((int) $hour * 60) + (int) $minute;
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array{patient_id: string|null, guest_name: string|null, guest_phone: string|null}
     */
    private function identityAttributes(array $validated): array
    {
        $patientId = $validated['patient_id'] ?? null;
        if (is_string($patientId) && $patientId !== '') {
            return [
                'patient_id' => $patientId,
                'guest_name' => null,
                'guest_phone' => null,
            ];
        }

        return [
            'patient_id' => null,
            'guest_name' => is_string($validated['guest_name'] ?? null)
                ? trim($validated['guest_name'])
                : null,
            'guest_phone' => is_string($validated['guest_phone'] ?? null)
                ? trim($validated['guest_phone'])
                : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function syncPatientCategory(Patient $patient, array $validated): void
    {
        if (! array_key_exists('category_id', $validated)) {
            return;
        }

        $categoryId = $validated['category_id'];
        $patient->categories()->sync(is_string($categoryId) && $categoryId !== '' ? [$categoryId] : []);
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
            $query->orderByDesc('appointment_date')->orderByDesc('start_time');

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
            $query->orderByDesc('appointment_date')->orderByDesc('start_time');
        }
    }
}
