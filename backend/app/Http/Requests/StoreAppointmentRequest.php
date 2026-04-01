<?php

namespace App\Http\Requests;

use App\Models\Appointment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAppointmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $dentistId = $this->user()?->tenantDentistId();

        return [
            'patient_id' => [
                'required',
                'uuid',
                Rule::exists('patients', 'id')->where(
                    fn ($query) => $query
                        ->where('dentist_id', $dentistId)
                        ->whereNull('deleted_at')
                ),
            ],
            'appointment_date' => ['required', 'date'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i', 'after:start_time'],
            'status' => [
                'nullable',
                Rule::in([
                    Appointment::STATUS_SCHEDULED,
                    Appointment::STATUS_COMPLETED,
                    Appointment::STATUS_CANCELLED,
                    Appointment::STATUS_NO_SHOW,
                ]),
            ],
            'reason' => ['nullable', 'string', 'max:255'],
        ];
    }
}
