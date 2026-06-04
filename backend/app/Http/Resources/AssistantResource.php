<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AssistantResource extends JsonResource
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
        /** @var User $assistant */
        $assistant = $this->resource;

        return [
            'id' => (string) $assistant->id,
            'name' => $assistant->name,
            'email' => $assistant->email,
            'phone' => $assistant->phone,
            // The owner-facing team UI shows assistant avatars (Stripe-
            // Linear pattern). Without this field the staff page falls
            // back to initials for everyone, even when an assistant has
            // a profile photo set. Mock already returns avatar_url; the
            // backend was the diverging side.
            'avatar_url' => $assistant->avatar_url,
            'account_status' => $assistant->account_status,
            'assistant_permissions' => User::normalizeAssistantPermissions($assistant->assistant_permissions ?? []),
            'must_change_password' => (bool) $assistant->must_change_password,
            'last_login_at' => $assistant->last_login_at?->toIso8601String(),
            'created_at' => $assistant->created_at?->toIso8601String(),
        ];
    }
}
