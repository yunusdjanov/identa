<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password as PasswordRule;

class ResetDentistPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Same defense-in-depth pattern as the other admin FormRequests —
        // see UpdateDentistStatusRequest for the rationale.
        $user = $this->user();

        return $user !== null && $user->isAdmin();
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // Match the complexity of the public AuthController::resetPassword
        // and AuthController::changePassword rules (letters + numbers).
        // Admin-set transient passwords used to be allowed to be weaker
        // than user-self-set ones — `must_change_password=true` forces a
        // rotation on first login, but until that login lands the
        // transient is the active credential. No reason to let it be
        // weaker than what the user would choose themselves.
        return [
            'new_password' => [
                'required',
                'string',
                'confirmed',
                PasswordRule::min(8)->letters()->numbers(),
                'max:255',
            ],
        ];
    }
}
