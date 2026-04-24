<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class FinalizeTreatmentImageBatchUploadRequest extends FormRequest
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
            'upload_ids' => ['required', 'array', 'min:1', 'max:10'],
            'upload_ids.*' => ['required', 'string', 'uuid'],
        ];
    }
}
