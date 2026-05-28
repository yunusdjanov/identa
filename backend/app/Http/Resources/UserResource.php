<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function __construct(User $resource)
    {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $this->resource;

        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'provider' => $user->provider,
            'avatar_url' => $user->avatar_url,
            'email_verified_at' => $user->email_verified_at?->toIso8601String(),
            'email_verified' => $user->hasVerifiedEmail(),
            'has_password' => $user->password !== null,
            'account_status' => $user->account_status,
            'dentist_owner_id' => $user->dentist_owner_id !== null ? (string) $user->dentist_owner_id : null,
            'assistant_permissions' => User::normalizeAssistantPermissions($user->assistant_permissions ?? []),
            'must_change_password' => (bool) $user->must_change_password,
            'subscription' => $user->subscriptionOwner()?->subscriptionSummary(),
        ];
    }
}
