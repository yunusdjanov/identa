<?php

namespace App\Http\Requests\Admin;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateDentistStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Defense in depth — route group is already gated by `role:admin`
        // middleware, but mirroring the StoreDentistRequest /
        // ManageDentistSubscriptionRequest pattern means a future refactor
        // that exposes this route through a less-guarded group still
        // refuses non-admin actors at the FormRequest layer.
        $user = $this->user();

        return $user !== null && $user->isAdmin();
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'status' => [
                'required',
                Rule::in([
                    User::ACCOUNT_STATUS_ACTIVE,
                    User::ACCOUNT_STATUS_BLOCKED,
                ]),
            ],
        ];
    }
}
