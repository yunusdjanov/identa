<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateNotificationPreferencesRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Backs the mobile Settings → Notifications sheet
 * (src/api/notifications.ts). GET returns the resolved toggles (stored JSON
 * merged over defaults); PUT persists a partial update and echoes the
 * resolved set back. Read-only here is intentional — flipping a push toggle
 * is a personal preference, never a clinical mutation, so it stays out of the
 * subscription.access gate.
 */
class SettingsNotificationController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => $user->notificationPreferences(),
        ]);
    }

    public function update(UpdateNotificationPreferencesRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // Merge the incoming partial onto the already-resolved set so unspecified
        // toggles keep their current value rather than reverting to defaults.
        $user->notification_preferences = array_merge(
            $user->notificationPreferences(),
            $request->preferences(),
        );
        $user->save();

        return response()->json([
            'data' => $user->notificationPreferences(),
        ]);
    }
}
