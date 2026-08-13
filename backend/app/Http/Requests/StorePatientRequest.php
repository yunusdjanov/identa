<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePatientRequest extends FormRequest
{
    private const NULLABLE_TEXT_FIELDS = [
        'secondary_phone',
        'address',
        'medical_history',
        'allergies',
        'current_medications',
    ];

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
            'medical_history' => ['nullable', 'string', 'max:300'],
            'allergies' => ['nullable', 'string', 'max:40'],
            'current_medications' => ['nullable', 'string', 'max:120'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $normalized = [];

        foreach (['full_name', 'phone', ...self::NULLABLE_TEXT_FIELDS] as $field) {
            $value = $this->input($field);
            if (! is_string($value)) {
                continue;
            }

            $value = trim($value);
            $normalized[$field] = in_array($field, self::NULLABLE_TEXT_FIELDS, true) && $value === ''
                ? null
                : $value;
        }

        if ($normalized !== []) {
            $this->merge($normalized);
        }
    }
}
