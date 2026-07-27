<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ListPaymentLedgerRequest extends FormRequest
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
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'include_patient_photo' => ['sometimes', 'boolean'],
            'filter' => ['sometimes', 'array'],
            'filter.patient_id' => ['sometimes', 'nullable', 'uuid'],
            'filter.search' => ['sometimes', 'nullable', 'string', 'max:160'],
            'filter.outstanding' => ['sometimes', 'boolean'],
        ];
    }
}
