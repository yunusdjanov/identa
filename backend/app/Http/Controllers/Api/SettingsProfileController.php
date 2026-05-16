<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateProfileRequest;
use App\Http\Resources\ProfileResource;
use App\Models\User;
use App\Services\ProfileSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsProfileController extends Controller
{
    public function __construct(
        private readonly ProfileSettingsService $profiles,
    ) {}

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

        return response()->json([
            'data' => $this->transformProfile($this->profiles->update($request, $user)),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformProfile(User $user): array
    {
        return (new ProfileResource($user))->resolve(request());
    }
}
