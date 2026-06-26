<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePaymentExpenseRequest extends FormRequest
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
            'title' => ['required', 'string', 'min:2', 'max:160'],
            'amount' => ['required', 'numeric', 'min:0.01', 'max:99999999.99'],
            'expense_date' => ['required', 'date'],
        ];
    }
}
