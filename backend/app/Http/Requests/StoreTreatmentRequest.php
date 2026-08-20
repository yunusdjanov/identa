<?php

namespace App\Http\Requests;

use App\Models\Treatment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTreatmentRequest extends FormRequest
{
    /** Maximum value representable by the treatment DECIMAL(12, 2) columns. */
    private const MAX_FINANCIAL_AMOUNT = 9_999_999_999.99;

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
            'treatment_type' => ['required', 'string', 'min:2', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'comment' => ['nullable', 'string', 'max:5000'],
            'treatment_date' => ['required', 'date', 'before_or_equal:today'],
            'cost' => ['nullable', 'numeric', 'min:0', 'max:'.self::MAX_FINANCIAL_AMOUNT],
            'debt_amount' => ['nullable', 'numeric', 'min:0', 'max:'.self::MAX_FINANCIAL_AMOUNT],
            'paid_amount' => ['nullable', 'numeric', 'min:0', 'max:'.self::MAX_FINANCIAL_AMOUNT],
            'currency' => ['nullable', 'string', Rule::in(Treatment::SUPPORTED_CURRENCIES)],
            'notes' => ['nullable', 'string', 'max:5000'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $normalized = [];

        if ($this->has('treatment_type') && is_string($this->input('treatment_type'))) {
            $normalized['treatment_type'] = trim((string) $this->input('treatment_type'));
        }

        foreach (['description', 'comment', 'notes'] as $field) {
            if (! $this->has($field) || ! is_string($this->input($field))) {
                continue;
            }

            $value = trim((string) $this->input($field));
            $normalized[$field] = $value !== '' ? $value : null;
        }

        if ($this->has('currency') && is_string($this->input('currency'))) {
            $normalized['currency'] = strtoupper(trim((string) $this->input('currency')));
        }

        if ($normalized !== []) {
            $this->merge($normalized);
        }
    }
}
