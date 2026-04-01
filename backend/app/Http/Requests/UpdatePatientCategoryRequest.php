<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePatientCategoryRequest extends FormRequest
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
        $categoryId = $this->route('patient_category') ?? $this->route('id');
        $dentistId = $this->user()?->tenantDentistId();

        return [
            'name' => [
                'required',
                'string',
                'min:3',
                'max:100',
                Rule::unique('patient_categories', 'name')
                    ->where(fn ($query) => $query->where('dentist_id', $dentistId))
                    ->ignore($categoryId),
            ],
            'color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:999'],
        ];
    }
}
