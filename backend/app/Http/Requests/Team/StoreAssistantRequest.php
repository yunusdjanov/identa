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
        return User::allowedAssistantPermissions();
    }
}
