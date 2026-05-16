<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAppointmentRequest;
use App\Http\Requests\UpdateAppointmentRequest;
use App\Http\Resources\AppointmentResource;
use App\Models\Appointment;
use App\Services\AppointmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AppointmentController extends Controller
{
    public function __construct(
        private readonly AppointmentService $appointments,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $appointments = $this->appointments->list($request);

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

    public function lookup(Request $request): JsonResponse
    {
        $appointments = $this->appointments->lookup($request);

        return response()->json([
            'data' => $appointments
                ->getCollection()
                ->map(static fn (Appointment $appointment): array => [
                    'id' => (string) $appointment->id,
                    'appointment_date' => $appointment->appointment_date?->toDateString(),
                    'start_time' => substr((string) $appointment->start_time, 0, 5),
                    'patient_name' => $appointment->patient?->full_name,
                    'status' => $appointment->status,
                ])
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
        return response()->json([
            'data' => $this->transformAppointment($this->appointments->create($request)),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'data' => $this->transformAppointment($this->appointments->ownedAppointment($request, $id)),
        ]);
    }

    public function update(UpdateAppointmentRequest $request, string $id): JsonResponse
    {
        return response()->json([
            'data' => $this->transformAppointment($this->appointments->update($request, $id)),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->appointments->delete($request, $id);

        return response()->json([], 204);
    }

    /**
     * @return array<string, string|null>
     */
    private function transformAppointment(Appointment $appointment): array
    {
        return (new AppointmentResource($appointment))->resolve(request());
    }
}
