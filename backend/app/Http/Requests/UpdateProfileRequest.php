<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProfileRequest extends FormRequest
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
            'name' => ['sometimes', 'required', 'string', 'min:3', 'max:255'],
            'email' => [
                'sometimes',
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($this->user()?->id),
            ],
            'phone' => ['nullable', 'string', 'max:50', 'regex:/^\+\d{9,15}$/'],
            'practice_name' => ['nullable', 'string', 'min:3', 'max:255'],
            'license_number' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'min:3', 'max:255'],
            'working_hours_start' => ['nullable', 'date_format:H:i'],
            'working_hours_end' => ['nullable', 'date_format:H:i'],
            'default_appointment_duration' => ['nullable', 'integer', Rule::in([15, 30, 45, 60])],
        ];
    }
}
