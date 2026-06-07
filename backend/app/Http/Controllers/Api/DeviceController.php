<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterDeviceRequest;
use App\Models\Device;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * Push-token registration for the mobile app (src/api/devices.ts). The mobile
 * client posts its Expo token once after login and again on every relaunch;
 * we dedup on (user, token) so relaunches refresh metadata instead of piling
 * up rows. There is no list/delete here yet — the token lifecycle is owned by
 * the device, and a stale token is pruned when Expo reports it as
 * unregistered at push time.
 */
class DeviceController extends Controller
{
    public function register(RegisterDeviceRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $validated = $request->validated();

        $device = Device::updateOrCreate(
            [
                'user_id' => $user->id,
                'expo_push_token' => $validated['expo_push_token'],
            ],
            [
                'platform' => $validated['platform'],
                'app_version' => $validated['app_version'] ?? null,
                'device_name' => $validated['device_name'] ?? null,
                'last_registered_at' => now(),
            ],
        );

        return response()->json([
            'data' => [
                'id' => $device->id,
                'expo_push_token' => $device->expo_push_token,
                'registered_at' => $device->last_registered_at?->toIso8601String(),
            ],
        ], $device->wasRecentlyCreated ? 201 : 200);
    }
}
