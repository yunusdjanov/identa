<?php

namespace App\Http\Requests;

use App\Models\Device;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterDeviceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Mirrors the mobile RegisterDevicePayload (src/api/devices.ts).
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'expo_push_token' => ['required', 'string', 'max:255'],
            'platform' => ['required', Rule::in([Device::PLATFORM_IOS, Device::PLATFORM_ANDROID])],
            'app_version' => ['nullable', 'string', 'max:32'],
            'device_name' => ['nullable', 'string', 'max:120'],
        ];
    }
}
