<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAppointmentRequest;
use App\Http\Requests\UpdateAppointmentRequest;
use App\Models\Appointment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AppointmentController extends Controller
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

    public function index(Request $request): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);
        $perPage = $this->resolvePerPage($request);
        $query = Appointment::query()
            ->where('dentist_id', $dentistId)
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

        $appointments = $query->paginate($perPage);

        return response()->json([
            'data' => $appointments
                ->getCollection()
                ->map(fn (Appointment $appointment): array => $this->transformAppointment($appointment))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $appointments->currentPage(),
                    'per_page' => $appointments->perPage(),
                    'total' => $appointments->total(),
                    'total_pages' => $appointments->lastPage(),
                ],
            ],
        ]);
    }

    public function store(StoreAppointmentRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $dentistId = $this->resolveDentistId($request);
        $status = $validated['status'] ?? Appointment::STATUS_SCHEDULED;

        $appointment = DB::transaction(function () use ($validated, $dentistId, $status): Appointment {
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

        return response()->json([
            'data' => $this->transformAppointment($appointment),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $appointment = $this->findOwnedAppointment($request, $id);

        return response()->json([
            'data' => $this->transformAppointment($appointment),
        ]);
    }

    public function update(UpdateAppointmentRequest $request, string $id): JsonResponse
    {
        $appointment = $this->findOwnedAppointment($request, $id);

        if (in_array($appointment->status, self::IMMUTABLE_STATUSES, true)) {
            throw ValidationException::withMessages([
                'status' => [__('api.appointments.finalized_cannot_be_edited')],
            ]);
        }

        $validated = $request->validated();
        $status = $validated['status'] ?? Appointment::STATUS_SCHEDULED;

        $appointment = DB::transaction(function () use ($request, $appointment, $validated, $status): Appointment {
            $this->assertNoConflict(
                dentistId: $this->resolveDentistId($request),
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

        return response()->json([
            'data' => $this->transformAppointment($appointment),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $appointment = $this->findOwnedAppointment($request, $id);
        $appointment->delete();

        return response()->json([], 204);
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

        $query = Appointment::query()
            ->where('dentist_id', $dentistId)
            ->whereDate('appointment_date', $appointmentDate)
            ->whereNotIn('status', self::NON_BLOCKING_STATUSES)
            ->where('start_time', '<', $endTime)
            ->where('end_time', '>', $startTime)
            ->lockForUpdate();

        if ($ignoreAppointmentId !== null) {
            $query->where('id', '!=', $ignoreAppointmentId);
        }

        if ($query->exists()) {
            throw ValidationException::withMessages([
                'start_time' => [__(self::CONFLICT_MESSAGE_KEY)],
            ]);
        }
    }

    private function findOwnedAppointment(Request $request, string $id): Appointment
    {
        return Appointment::query()
            ->where('id', $id)
            ->where('dentist_id', $this->resolveDentistId($request))
            ->with('patient:id,full_name')
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

    /**
     * @return array<string, string|null>
     */
    private function transformAppointment(Appointment $appointment): array
    {
        return [
            'id' => (string) $appointment->id,
            'patient_id' => (string) $appointment->patient_id,
            'patient_name' => $appointment->patient?->full_name,
            'appointment_date' => $appointment->appointment_date?->toDateString(),
            'start_time' => substr((string) $appointment->start_time, 0, 5),
            'end_time' => substr((string) $appointment->end_time, 0, 5),
            'status' => $appointment->status,
            'notes' => $appointment->notes,
        ];
    }
}
