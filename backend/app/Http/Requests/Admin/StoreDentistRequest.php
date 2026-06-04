<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password as PasswordRule;

class StoreDentistRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Defense-in-depth: route middleware already enforces role:admin,
        // but a future router refactor could expose this endpoint. Reject
        // any non-admin actor at the request layer too.
        $user = $this->user();
        return $user !== null && method_exists($user, 'isAdmin') && $user->isAdmin();
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:3', 'max:255'],
            // Email unique scope excludes soft-deleted rows so a re-onboarded
            // dentist can reuse the email of a previously closed account.
            'email' => [
                'required',
                'email',
                'max:255',
                Rule::unique('users', 'email')->where(
                    fn ($query) => $query->where('account_status', '!=', \App\Models\User::ACCOUNT_STATUS_DELETED),
                ),
            ],
            // Mirror AuthController::register password policy. Without this,
            // admin-created accounts could land with weaker credentials than
            // public sign-ups (e.g. "12345678") — and the must_change_password
            // flag is not set on admin create, so that password would persist.
            'password' => ['required', 'string', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
            'phone' => ['nullable', 'string', 'max:50', 'regex:/^\+\d{9,15}$/'],
            'practice_name' => ['nullable', 'string', 'min:3', 'max:255'],
            'license_number' => ['nullable', 'string', 'max:50'],
            'address' => ['nullable', 'string', 'min:3', 'max:255'],
        ];
    }
}
