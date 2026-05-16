<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Subscription extends Model
{
    /** @use HasFactory<\Database\Factories\SubscriptionFactory> */
    use HasFactory;

    public const PERIOD_TRIAL = 'trial';
    public const PERIOD_MONTHLY = 'monthly';
    public const PERIOD_YEARLY = 'yearly';
    public const STATUS_ACTIVE = 'active';
    public const STATUS_READ_ONLY = 'read_only';
    public const STATUS_CANCELED = 'canceled';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'plan_id',
        'plan_code',
        'plan_name',
        'billing_period',
        'status',
        'starts_at',
        'ends_at',
        'cancel_at_period_end',
        'pending_plan_id',
        'pending_billing_period',
        'pending_change_effective_at',
        'pending_active_staff_ids',
        'expiration_warning_sent_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'cancel_at_period_end' => 'boolean',
            'pending_change_effective_at' => 'datetime',
            'pending_active_staff_ids' => 'array',
            'expiration_warning_sent_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, Subscription>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Plan, Subscription>
     */
    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    /**
     * @return HasMany<BillingPayment>
     */
    public function billingPayments(): HasMany
    {
        return $this->hasMany(BillingPayment::class);
    }
}
