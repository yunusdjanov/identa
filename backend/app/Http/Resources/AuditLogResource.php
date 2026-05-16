<?php

namespace App\Http\Resources;

use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
    public function __construct(AuditLog $resource)
    {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var AuditLog $entry */
        $entry = $this->resource;

        return [
            'id' => (string) $entry->id,
            'event_type' => $entry->event_type,
            'entity_type' => $entry->entity_type,
            'entity_id' => $entry->entity_id,
            'actor_role' => $entry->actor_role,
            'actor' => $entry->actor !== null
                ? [
                    'id' => (string) $entry->actor->id,
                    'name' => $entry->actor->name,
                    'email' => $entry->actor->email,
                    'role' => $entry->actor->role,
                ]
                : null,
            'ip_address' => $entry->ip_address,
            'user_agent' => $entry->user_agent,
            'metadata' => $entry->metadata,
            'created_at' => $entry->created_at?->toIso8601String(),
        ];
    }
}
