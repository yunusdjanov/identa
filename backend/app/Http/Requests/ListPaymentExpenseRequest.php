<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListPaymentExpenseRequest extends FormRequest
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
            'filter' => ['sometimes', 'array'],
            'filter.search' => ['sometimes', 'nullable', 'string', 'max:160'],
            'filter.date_from' => ['sometimes', 'nullable', 'date'],
            'filter.date_to' => [
                'sometimes',
                'nullable',
                'date',
                Rule::when(
                    $this->filled('filter.date_from'),
                    'after_or_equal:filter.date_from'
                ),
            ],
        ];
    }
}
