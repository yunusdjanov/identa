<?php

namespace App\Support;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class AuditLogger
{
    /**
     * @var list<string>
     */
    private const SENSITIVE_METADATA_PATTERNS = [
        'password',
        'token',
        'secret',
        'authorization',
        'cookie',
        'api_key',
    ];

    /**
     * @param  array<string, mixed>  $metadata
     */
    public function log(
        ?User $actor,
        string $eventType,
        ?string $entityType = null,
        ?string $entityId = null,
        array $metadata = [],
        ?string $ipAddress = null,
        ?string $userAgent = null,
    ): AuditLog {
        return AuditLog::query()->create([
            'actor_id' => $actor?->id,
            'dentist_id' => $actor?->tenantDentistId(),
            'actor_role' => $actor?->role,
            'event_type' => $eventType,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
            'metadata' => $metadata === [] ? null : $this->sanitizeMetadata($metadata),
        ]);
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    public function logFromRequest(
        Request $request,
        string $eventType,
        ?string $entityType = null,
        ?string $entityId = null,
        array $metadata = [],
    ): AuditLog {
        /** @var User|null $actor */
        $actor = $request->user();

        return $this->log(
            actor: $actor,
            eventType: $eventType,
            entityType: $entityType,
            entityId: $entityId,
            metadata: $metadata,
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
        );
    }

    /**
     * @param  array<string, mixed>  $metadata
     * @return array<string, mixed>
     */
    private function sanitizeMetadata(array $metadata): array
    {
        $sanitized = [];

        foreach ($metadata as $key => $value) {
            if ($this->isSensitiveKey((string) $key)) {
                $sanitized[$key] = '[REDACTED]';

                continue;
            }

            if (is_array($value)) {
                $sanitized[$key] = $this->sanitizeMetadata($value);

                continue;
            }

            $sanitized[$key] = $value;
        }

        return $sanitized;
    }

    private function isSensitiveKey(string $key): bool
    {
        $normalizedKey = strtolower($key);

        foreach (self::SENSITIVE_METADATA_PATTERNS as $pattern) {
            if (str_contains($normalizedKey, $pattern)) {
                return true;
            }
        }

        return false;
    }
}
