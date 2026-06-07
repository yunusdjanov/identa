<?php

namespace App\Http\Requests;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

class UpdateNotificationPreferencesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Every toggle is optional (a PATCH-style partial update) but, when
     * present, must be a real boolean. Keys are restricted to the known set
     * so an attacker can't smuggle arbitrary JSON into the column.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $rules = [];
        foreach (array_keys(User::NOTIFICATION_PREFERENCE_DEFAULTS) as $key) {
            $rules[$key] = ['sometimes', 'boolean'];
        }

        return $rules;
    }

    /**
     * Only the recognised toggles, cast to booleans. Drops any unknown keys.
     *
     * @return array<string, bool>
     */
    public function preferences(): array
    {
        $out = [];
        foreach (array_keys(User::NOTIFICATION_PREFERENCE_DEFAULTS) as $key) {
            if ($this->has($key)) {
                $out[$key] = $this->boolean($key);
            }
        }

        return $out;
    }
}
