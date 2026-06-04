<?php

namespace App\Http\Requests\Team;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAssistantStatusRequest extends FormRequest
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
        return [
            'status' => [
                'required',
                'string',
                Rule::in([
                    User::ACCOUNT_STATUS_ACTIVE,
                    User::ACCOUNT_STATUS_BLOCKED,
                ]),
            ],
        ];
    }
}
