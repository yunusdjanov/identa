<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreLeadRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:255'],
            'phone' => ['required', 'string', 'min:9', 'max:32'],
            'clinic_name' => ['required', 'string', 'min:2', 'max:255'],
            'city' => ['required', 'string', 'min:2', 'max:255'],
            'note' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
