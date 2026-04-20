<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class UpdateLandingSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'trial_price_amount' => ['required', 'integer', 'min:0'],
            'monthly_price_amount' => ['required', 'integer', 'min:0'],
            'yearly_price_amount' => ['required', 'integer', 'min:0'],
            'telegram_contact_url' => ['nullable', 'url', 'max:500'],
        ];
    }
}
