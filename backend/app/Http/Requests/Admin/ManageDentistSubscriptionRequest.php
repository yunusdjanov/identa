<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ManageDentistSubscriptionRequest extends FormRequest
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
            'action' => [
                'required',
                'string',
                Rule::in([
                    'apply_monthly',
                    'apply_yearly',
                    'activate_monthly',
                    'activate_yearly',
                    'extend_monthly',
                    'extend_yearly',
                    'cancel_at_period_end',
                    'cancel_now',
                ]),
            ],
            'payment_method' => ['nullable', 'string', Rule::in(['cash', 'p2p', 'bank_transfer'])],
            'payment_amount' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
