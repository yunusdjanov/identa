<?php

namespace App\Http\Requests\Team;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAssistantRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Defense-in-depth — the route is already guarded by
        // `role:dentist` + `permission:team.manage`, but the FormRequest
        // must NOT silently allow non-dentists if some future refactor
        // attaches it to a different group. Mirrors the admin-side
        // hardening done in F12.
        return $this->user()?->isDentist() === true;
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
