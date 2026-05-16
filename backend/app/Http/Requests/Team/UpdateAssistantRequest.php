<?php

namespace App\Http\Requests\Team;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAssistantRequest extends FormRequest
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
        $assistantId = $this->route('id');

        return [
            'name' => ['required', 'string', 'min:3', 'max:255'],
            'email' => [
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($assistantId),
            ],
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
