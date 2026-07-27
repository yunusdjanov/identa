<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAppointmentRequest;
use App\Http\Requests\StorePatientRequest;
use App\Http\Requests\UpdateAppointmentRequest;
use App\Http\Resources\AppointmentResource;
use App\Models\Appointment;
use App\Models\Patient;
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

    public function createPatientCard(StorePatientRequest $request, string $id): JsonResponse
    {
        $result = $this->appointments->createPatientCardFromGuest($request, $id);

        return response()->json([
            'data' => [
                'appointment' => $this->transformAppointment($result['appointment']),
                'patient' => $this->transformPatientCard($result['patient']),
            ],
        ], 201);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->appointments->delete($request, $id);

        return response()->json([], 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformAppointment(Appointment $appointment): array
    {
        return (new AppointmentResource($appointment))->resolve(request());
    }

    /**
     * @return array<string, mixed>
     */
    private function transformPatientCard(Patient $patient): array
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
            'created_at' => $patient->created_at?->toIso8601String(),
            'updated_at' => $patient->updated_at?->toIso8601String(),
            'is_archived' => $patient->trashed(),
            'archived_at' => $patient->deleted_at?->toIso8601String(),
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
}
