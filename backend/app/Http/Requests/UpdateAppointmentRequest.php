<?php

namespace App\Http\Requests;

use App\Models\Appointment;
use Illuminate\Validation\Rule;

/**
 * Edits override two rules from the create form:
 *  - `appointment_date` drops `after_or_equal:today` because existing
 *    past appointments must remain editable (typically to flip status
 *    from `scheduled` → `completed/cancelled/no_show` post-hoc).
 *  - `status` allows the full set of statuses; AppointmentService::update
 *    enforces the `IMMUTABLE_STATUSES` invariant once a row is finalised.
 */
class UpdateAppointmentRequest extends StoreAppointmentRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $rules = parent::rules();

        $rules['appointment_date'] = ['required', 'date'];
        $rules['status'] = [
            'nullable',
            Rule::in([
                Appointment::STATUS_SCHEDULED,
                Appointment::STATUS_COMPLETED,
                Appointment::STATUS_CANCELLED,
                Appointment::STATUS_NO_SHOW,
            ]),
        ];

        return $rules;
    }
}
