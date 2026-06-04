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
            // Server-side guard against past-date booking. UI already
            // blocks via the date picker, but the API used to accept any
            // date — letting a malicious or scripted client backdate
            // appointments. UpdateAppointmentRequest overrides this rule
            // because existing past appointments must remain editable
            // (e.g., marking yesterday's slot as completed). FA-X1.
            'appointment_date' => ['required', 'date', 'after_or_equal:today'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i', 'after:start_time'],
            // On CREATE, restrict status to the only valid initial state.
            // Allowing `completed/cancelled/no_show` on POST bypasses the
            // immutability barrier in AppointmentService::update — UI
            // never sends these on POST anyway. Edits use a separate
            // path that respects the IMMUTABLE_STATUSES contract.
            'status' => [
                'nullable',
                Rule::in([Appointment::STATUS_SCHEDULED]),
            ],
            'reason' => ['nullable', 'string', 'max:255'],
        ];
    }
}
