<?php

namespace App\Http\Resources;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
    /**
     * Metadata keys that carry monetary values. When the viewer lacks
     * `payments.view`, these keys are scrubbed from the serialized
     * metadata so a privileged audit-log viewer (e.g. an assistant with
     * `audit_logs.view` but no payments scope) can still see WHAT
     * happened (event_type, actor, entity) without WHICH AMOUNT — the
     * payments register itself is already gated behind `payments.view`,
     * so leaking the amount through the audit feed would defeat that
     * gate.
     */
    private const FINANCIAL_METADATA_KEYS = [
        'amount',
        'cost',
        'debt_amount',
        'paid_amount',
        'total_amount',
        'total_paid',
        'total_debt',
        'balance',
        'unit_price',
        'total_price',
        'refund_amount',
        'payment_amount',
        'price',
    ];

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

        $viewer = $request->user();
        $canViewFinancials = $viewer instanceof User
            && $viewer->hasPermission(User::PERMISSION_PAYMENTS_VIEW);

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
            'metadata' => $canViewFinancials
                ? $entry->metadata
                : self::scrubFinancialMetadata($entry->metadata),
            'created_at' => $entry->created_at?->toIso8601String(),
        ];
    }

    /**
     * Recursively remove monetary keys from metadata so a viewer without
     * `payments.view` doesn't infer amounts from audit-log entries.
     *
     * @param  array<string, mixed>|null  $metadata
     * @return array<string, mixed>|null
     */
    private static function scrubFinancialMetadata(?array $metadata): ?array
    {
        if ($metadata === null) {
            return null;
        }

        $scrubbed = [];
        foreach ($metadata as $key => $value) {
            if (in_array((string) $key, self::FINANCIAL_METADATA_KEYS, true)) {
                $scrubbed[$key] = '[REDACTED]';
                continue;
            }

            $scrubbed[$key] = is_array($value)
                ? self::scrubFinancialMetadata($value)
                : $value;
        }

        return $scrubbed;
    }
}
