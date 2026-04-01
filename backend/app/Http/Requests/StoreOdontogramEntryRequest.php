<?php

namespace App\Http\Requests;

use App\Models\OdontogramEntry;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreOdontogramEntryRequest extends FormRequest
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
            'tooth_number' => ['required', 'integer', 'between:1,32'],
            'condition_type' => [
                'required',
                Rule::in([
                    OdontogramEntry::TYPE_HEALTHY,
                    OdontogramEntry::TYPE_CAVITY,
                    OdontogramEntry::TYPE_FILLING,
                    OdontogramEntry::TYPE_CROWN,
                    OdontogramEntry::TYPE_ROOT_CANAL,
                    OdontogramEntry::TYPE_EXTRACTION,
                    OdontogramEntry::TYPE_IMPLANT,
                ]),
            ],
            'surface' => ['nullable', 'string', 'max:50'],
            'material' => ['nullable', 'string', 'max:100'],
            'severity' => ['nullable', 'string', 'max:50'],
            'condition_date' => ['required', 'date'],
            'notes' => ['nullable', 'string'],
        ];
    }
}
