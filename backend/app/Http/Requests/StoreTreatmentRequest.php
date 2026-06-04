<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class StoreTreatmentRequest extends FormRequest
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
        return [
            'tooth_number' => ['nullable', 'integer', 'between:1,32'],
            'teeth' => ['nullable', 'array'],
            'teeth.*' => ['integer', 'between:1,32', 'distinct'],
            'treatment_type' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'comment' => ['nullable', 'string', 'max:5000'],
            'treatment_date' => ['required', 'date', 'before_or_equal:today'],
            'cost' => ['nullable', 'numeric', 'min:0'],
            'debt_amount' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }

    /**
     * Cross-field validation: paid_amount must not exceed debt_amount.
     *
     * Without this, a typo (e.g. extra zero in paid) would store
     * `paid_amount > debt_amount`, producing a negative balance on
     * TreatmentResource and `total_balance` on the patient overview.
     * Dashboard sums clip with `CASE WHEN > 0` so revenue isn't poisoned,
     * but per-treatment/patient APIs and admin refund flows have no
     * documented handling for negative numbers — easiest to refuse the
     * input outright at the boundary.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
            $paid = $this->input('paid_amount');
            $debt = $this->input('debt_amount');

            if ($paid === null || $debt === null) {
                return;
            }
            if (!is_numeric($paid) || !is_numeric($debt)) {
                return;
            }
            if ((float) $paid > (float) $debt) {
                $v->errors()->add(
                    'paid_amount',
                    __('api.treatments.paid_exceeds_debt'),
                );
            }
        });
    }
}
