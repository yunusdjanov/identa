<?php

namespace App\Http\Requests;

use App\Support\MediaUploadLimits;
use Illuminate\Foundation\Http\FormRequest;

class UploadTreatmentImageRequest extends FormRequest
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
            'image' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:'.MediaUploadLimits::maxKilobytes()],
        ];
    }
}
