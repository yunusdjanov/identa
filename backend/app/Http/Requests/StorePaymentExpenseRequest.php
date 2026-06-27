<?php

namespace App\Http\Requests;

use App\Models\PaymentExpense;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
            'quantity' => ['nullable', 'numeric', 'min:0.01', 'max:999999.99'],
            'currency' => ['nullable', 'string', Rule::in(PaymentExpense::CURRENCIES)],
            'expense_date' => ['required', 'date'],
        ];
    }
}
