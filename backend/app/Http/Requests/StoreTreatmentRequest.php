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
            'treatment_type' => ['required', 'string', 'max:255'],
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
}
