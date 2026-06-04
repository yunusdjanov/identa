<?php

namespace App\Http\Requests\Team;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password as PasswordRule;

class ResetAssistantPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Defense-in-depth — see StoreAssistantRequest::authorize.
        return $this->user()?->isDentist() === true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // Same letters+numbers complexity as the public reset/change
        // password rules. Without this, a dentist could set an
        // assistant's transient password to `12345678` — must_change
        // forces rotation on first login, but the transient is still
        // valid until then.
        return [
            'new_password' => [
                'required',
                'string',
                'confirmed',
                PasswordRule::min(8)->letters()->numbers(),
            ],
        ];
    }
}
