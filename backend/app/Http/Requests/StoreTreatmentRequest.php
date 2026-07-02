<?php

namespace App\Http\Requests;

use App\Models\Treatment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
            'currency' => ['nullable', 'string', Rule::in(Treatment::SUPPORTED_CURRENCIES)],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }
}
