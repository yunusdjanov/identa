<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class PrepareTreatmentImageBatchUploadRequest extends FormRequest
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
            'files' => ['required', 'array', 'min:1', 'max:10'],
            'files.*.client_id' => ['required', 'string', 'max:80'],
            'files.*.filename' => ['required', 'string', 'max:255'],
            'files.*.content_type' => ['required', 'string', 'in:image/jpeg,image/jpg,image/png,image/webp'],
            'files.*.file_size' => ['required', 'integer', 'min:1', 'max:1048576'],
        ];
    }
}
