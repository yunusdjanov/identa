<?php

namespace App\Models;

use App\Contracts\TenantOwned;
use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model implements TenantOwned
{
    /** @use HasFactory<\Database\Factories\AuditLogFactory> */
    use BelongsToTenant, HasFactory, HasUuids;

    public const UPDATED_AT = null;

    /**
     * @var bool
     */
    public $incrementing = false;

    /**
     * @var string
     */
    protected $keyType = 'string';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'actor_id',
        'dentist_id',
        'actor_role',
        'event_type',
        'entity_type',
        'entity_id',
        'ip_address',
        'user_agent',
        'metadata',
        'created_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /**
     * Audit rows are append-only. Block updates and deletes at the model
     * layer so a future controller bug can never silently rewrite history.
     * Production audit-log integrity is the kind of property that's easy
     * to assume and impossible to retrofit — the throw makes any attempted
     * mutation loud, in tests as well as in incidents.
     */
    protected static function booted(): void
    {
        static::updating(function (): void {
            throw new \LogicException('AuditLog rows are immutable.');
        });

        static::deleting(function (): void {
            throw new \LogicException('AuditLog rows are immutable.');
        });
    }

    /**
     * @return BelongsTo<User, AuditLog>
     */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    /**
     * @return BelongsTo<User, AuditLog>
     */
    public function dentist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'dentist_id');
    }
}
