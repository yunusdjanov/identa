<?php

namespace App\Services;

use App\Http\Requests\StoreAppointmentRequest;
use App\Http\Requests\UpdateAppointmentRequest;
use App\Models\Appointment;
use App\Models\User;
use App\Support\Search;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AppointmentService
{
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
            ->with('patient:id,full_name');

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
            $query->whereHas('patient', function (Builder $builder) use ($search): void {
                // Case-insensitive across all DB drivers (Postgres LIKE is
                // case-sensitive; mobile keyboards default to lowercase).
                Search::ciLike($builder, 'full_name', $search);
            });
        }

        return $query->paginate(min($this->perPage($request), 50), [
            'id',
            'patient_id',
            'appointment_date',
            'start_time',
            'status',
        ]);
    }

    public function create(StoreAppointmentRequest $request): Appointment
    {
        $validated = $request->validated();
        $dentistId = $this->dentistId($request);
        $status = $validated['status'] ?? Appointment::STATUS_SCHEDULED;

        return DB::transaction(function () use ($validated, $dentistId, $status): Appointment {
            $this->assertNoConflict(
                dentistId: $dentistId,
                appointmentDate: $validated['appointment_date'],
                startTime: $validated['start_time'],
                endTime: $validated['end_time'],
                status: $status,
            );

            return Appointment::create([
                ...$validated,
                'dentist_id' => $dentistId,
                'status' => $status,
                'notes' => $validated['reason'] ?? null,
            ])->load('patient:id,full_name');
        });
    }

    public function update(UpdateAppointmentRequest $request, string $id): Appointment
    {
        $appointment = $this->ownedAppointment($request, $id);

        if (in_array($appointment->status, self::IMMUTABLE_STATUSES, true)) {
            throw ValidationException::withMessages([
                'status' => [__('api.appointments.finalized_cannot_be_edited')],
            ]);
        }

        $validated = $request->validated();
        $status = $validated['status'] ?? Appointment::STATUS_SCHEDULED;

        return DB::transaction(function () use ($request, $appointment, $validated, $status): Appointment {
            $this->assertNoConflict(
                dentistId: $this->dentistId($request),
                appointmentDate: $validated['appointment_date'],
                startTime: $validated['start_time'],
                endTime: $validated['end_time'],
                status: $status,
                ignoreAppointmentId: $appointment->id,
            );

            $appointment->update([
                ...$validated,
                'status' => $status,
                'notes' => $validated['reason'] ?? null,
            ]);

            return $appointment->fresh()->load('patient:id,full_name');
        });
    }

    public function delete(Request $request, string $id): void
    {
        $this->ownedAppointment($request, $id)->delete();
    }

    public function ownedAppointment(Request $request, string $id): Appointment
    {
        return Appointment::query()
            ->where('id', $id)
            ->where('dentist_id', $this->dentistId($request))
            ->with('patient:id,full_name')
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
