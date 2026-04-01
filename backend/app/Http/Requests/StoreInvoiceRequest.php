<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreInvoiceRequest extends FormRequest
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
            'patient_id' => [
                'required',
                'uuid',
                Rule::exists('patients', 'id')
                    ->where(fn ($query) => $query
                        ->where('dentist_id', $dentistId)
                        ->whereNull('deleted_at')),
            ],
            'invoice_date' => ['required', 'date'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.description' => ['required', 'string', 'min:3', 'max:255'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0.01'],
            'items.*.odontogram_entry_id' => ['nullable', 'uuid'],
        ];
    }
}
