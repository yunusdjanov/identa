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
            'account_status' => $assistant->account_status,
            'assistant_permissions' => User::normalizeAssistantPermissions($assistant->assistant_permissions ?? []),
            'must_change_password' => (bool) $assistant->must_change_password,
            'last_login_at' => $assistant->last_login_at?->toIso8601String(),
            'created_at' => $assistant->created_at?->toIso8601String(),
        ];
    }
}
