<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Plan extends Model
{
    /** @use HasFactory<\Database\Factories\PlanFactory> */
    use HasFactory;

    public const CODE_TRIAL = 'trial';
    public const CODE_BASIC = 'basic';
    public const CODE_PRO = 'pro';
    public const CODES = [
        self::CODE_TRIAL,
        self::CODE_BASIC,
        self::CODE_PRO,
    ];

    /**
     * @var list<string>
     */
    protected $fillable = [
        'code',
        'name',
        'description',
        'is_trial',
        'is_paid',
        'trial_days',
        'monthly_price',
        'yearly_price',
        'currency',
        'staff_limit',
        'entry_image_limit',
        'upload_max_mb',
        'stored_image_max_mb',
        'can_export',
        'is_active',
        'sort_order',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_trial' => 'boolean',
            'is_paid' => 'boolean',
            'trial_days' => 'integer',
            'monthly_price' => 'decimal:2',
            'yearly_price' => 'decimal:2',
            'staff_limit' => 'integer',
            'entry_image_limit' => 'integer',
            'upload_max_mb' => 'decimal:2',
            'stored_image_max_mb' => 'decimal:2',
            'can_export' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /**
     * @return HasMany<Subscription>
     */
    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }
}
