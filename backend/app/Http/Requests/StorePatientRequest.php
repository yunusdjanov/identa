<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePatientRequest extends FormRequest
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
            'full_name' => ['required', 'string', 'min:3', 'max:255'],
            'phone' => ['required', 'string', 'max:50', 'regex:/^\+\d{9,15}$/'],
            'secondary_phone' => ['nullable', 'string', 'max:50', 'regex:/^\+\d{9,15}$/'],
            'category_id' => [
                'nullable',
                'uuid',
                Rule::exists('patient_categories', 'id')
                    ->where(fn ($query) => $query->where('dentist_id', $dentistId)),
            ],
            'address' => ['nullable', 'string', 'min:3', 'max:255'],
            'date_of_birth' => ['nullable', 'date', 'before_or_equal:today'],
            'gender' => ['nullable', Rule::in(['male', 'female'])],
            'medical_history' => ['nullable', 'string', 'max:2000'],
            'allergies' => ['nullable', 'string', 'max:255'],
            'current_medications' => ['nullable', 'string', 'max:255'],
        ];
    }
}
