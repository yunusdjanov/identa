<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\SerializesRecordActors;
use App\Models\Appointment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AppointmentResource extends JsonResource
{
    use SerializesRecordActors;

    public function __construct(Appointment $resource)
    {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Appointment $appointment */
        $appointment = $this->resource;

        return [
            'id' => (string) $appointment->id,
            'patient_id' => $appointment->patient_id !== null ? (string) $appointment->patient_id : null,
            'patient_name' => $appointment->patient?->full_name ?? $appointment->guest_name,
            'guest_name' => $appointment->guest_name,
            'guest_phone' => $appointment->guest_phone,
            'is_guest' => $appointment->patient_id === null,
            'appointment_date' => $appointment->appointment_date?->toDateString(),
            'start_time' => substr((string) $appointment->start_time, 0, 5),
            'end_time' => substr((string) $appointment->end_time, 0, 5),
            'status' => $appointment->status,
            'notes' => $appointment->notes,
            'created_by' => $this->actorSummary($appointment, 'createdBy'),
            'updated_by' => $this->actorSummary($appointment, 'updatedBy'),
        ];
    }
}
