<?php

namespace App\Http\Requests\Team;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAssistantRequest extends FormRequest
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
            'name' => ['required', 'string', 'min:3', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'phone' => ['nullable', 'string', 'max:50', 'regex:/^\+\d{9,15}$/'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', Rule::in($this->allowedPermissions()), 'distinct'],
        ];
    }

    /**
     * @return list<string>
     */
    private function allowedPermissions(): array
    {
        return [
            User::PERMISSION_PATIENTS_VIEW,
            User::PERMISSION_PATIENTS_MANAGE,
            User::PERMISSION_APPOINTMENTS_VIEW,
            User::PERMISSION_APPOINTMENTS_MANAGE,
            User::PERMISSION_INVOICES_VIEW,
            User::PERMISSION_INVOICES_MANAGE,
            User::PERMISSION_PAYMENTS_VIEW,
            User::PERMISSION_PAYMENTS_MANAGE,
            User::PERMISSION_ODONTOGRAM_VIEW,
            User::PERMISSION_ODONTOGRAM_MANAGE,
            User::PERMISSION_TREATMENTS_VIEW,
            User::PERMISSION_TREATMENTS_MANAGE,
            User::PERMISSION_PATIENT_CATEGORIES_VIEW,
            User::PERMISSION_PATIENT_CATEGORIES_MANAGE,
        ];
    }
}
