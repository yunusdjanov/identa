<?php

namespace App\Http\Requests;

use App\Models\Payment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePaymentRequest extends FormRequest
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
            'invoice_id' => [
                'required',
                'uuid',
                Rule::exists('invoices', 'id')
                    ->where(fn ($query) => $query->where('dentist_id', $dentistId)),
            ],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => [
                'required',
                Rule::in([
                    Payment::METHOD_CASH,
                    Payment::METHOD_CARD,
                    Payment::METHOD_BANK_TRANSFER,
                ]),
            ],
            'payment_date' => ['required', 'date'],
        ];
    }
}
