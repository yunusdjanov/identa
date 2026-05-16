<?php

namespace App\Services;

use App\Http\Requests\UpdateProfileRequest;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Validation\ValidationException;

class ProfileSettingsService
{
    public function update(UpdateProfileRequest $request, User $user): User
    {
        $validated = $request->validated();

        if ($user->isAdmin()) {
            $validated = Arr::only($validated, ['name', 'email']);
        }

        if ($user->isAssistant()) {
            $validated = Arr::only($validated, ['name', 'email', 'phone']);
        }

        $start = $validated['working_hours_start'] ?? null;
        $end = $validated['working_hours_end'] ?? null;

        if ($start !== null && $end !== null && $end <= $start) {
            throw ValidationException::withMessages([
                'working_hours_end' => [__('api.settings.working_hours_end_after_start')],
            ]);
        }

        $user->update($validated);

        return $user->refresh();
    }
}
