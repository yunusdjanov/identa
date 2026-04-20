<?php

namespace App\Http\Requests\Admin;

use App\Models\LeadRequest;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateLeadRequestStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status' => [
                'required',
                'string',
                Rule::in([
                    LeadRequest::STATUS_NEW,
                    LeadRequest::STATUS_CONTACTED,
                    LeadRequest::STATUS_CLOSED,
                ]),
            ],
        ];
    }
}
