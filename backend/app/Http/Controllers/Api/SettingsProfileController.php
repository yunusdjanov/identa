<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateProfileRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SettingsProfileController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => $this->transformProfile($user),
        ]);
    }

    public function update(UpdateProfileRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validated = $request->validated();

        $start = $validated['working_hours_start'] ?? null;
        $end = $validated['working_hours_end'] ?? null;

        if ($start !== null && $end !== null && $end <= $start) {
            throw ValidationException::withMessages([
                'working_hours_end' => [__('api.settings.working_hours_end_after_start')],
            ]);
        }

        $user->update($validated);
        $user->refresh();

        return response()->json([
            'data' => $this->transformProfile($user),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformProfile(User $user): array
    {
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'practice_name' => $user->practice_name,
            'license_number' => $user->license_number,
            'address' => $user->address,
            'working_hours' => [
                'start' => $user->working_hours_start ? substr($user->working_hours_start, 0, 5) : null,
                'end' => $user->working_hours_end ? substr($user->working_hours_end, 0, 5) : null,
            ],
            'default_appointment_duration' => $user->default_appointment_duration,
        ];
    }
}
