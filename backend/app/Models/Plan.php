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
     * Mass-assignable attributes. Immutable identity fields (code, is_trial, is_paid)
     * are intentionally excluded to prevent privilege escalation — they may only be
     * set explicitly by trusted controllers (admin update, seeders).
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'description',
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
     * Currency and size fields use `float` rather than `decimal:N` so that
     * direct attribute reads (e.g. `$plan->monthly_price`) return numbers
     * instead of strings. The underlying DB columns are still `decimal(N,2)`
     * so storage precision is preserved.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_trial' => 'boolean',
            'is_paid' => 'boolean',
            'trial_days' => 'integer',
            'monthly_price' => 'float',
            'yearly_price' => 'float',
            'staff_limit' => 'integer',
            'entry_image_limit' => 'integer',
            'upload_max_mb' => 'float',
            'stored_image_max_mb' => 'float',
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

    /**
     * Defense-in-depth: even if a controller, seeder, or migration tries to write
     * a trial row with paid flags or non-zero prices, the model normalizes them
     * to the trial invariants before persistence. Identity (code) is still
     * controlled by callers since it is non-fillable.
     */
    protected static function booted(): void
    {
        static::saving(function (Plan $plan): void {
            if ($plan->code === self::CODE_TRIAL) {
                $plan->is_trial = true;
                $plan->is_paid = false;
                $plan->monthly_price = 0;
                $plan->yearly_price = 0;
                if ($plan->trial_days === null || (int) $plan->trial_days < 1) {
                    $plan->trial_days = 30;
                }
            } elseif (in_array($plan->code, [self::CODE_BASIC, self::CODE_PRO], true)) {
                $plan->is_trial = false;
                $plan->is_paid = true;
                $plan->trial_days = null;
            }
        });
    }

    public function isTrial(): bool
    {
        return $this->code === self::CODE_TRIAL;
    }

    /**
     * Count subscribers currently bound to this plan with a non-canceled status.
     * Used to gate destructive admin actions (deactivation, currency change).
     */
    public function liveSubscriptionsCount(): int
    {
        return $this->subscriptions()
            ->whereIn('status', [
                Subscription::STATUS_ACTIVE,
                Subscription::STATUS_READ_ONLY,
            ])
            ->count();
    }

    /**
     * True when at least one successful billing payment exists for this plan.
     * Used to lock currency / pricing identity after real money has changed hands.
     */
    public function hasPaidBillingHistory(): bool
    {
        return BillingPayment::query()
            ->where('plan_id', $this->id)
            ->where('status', BillingPayment::STATUS_PAID)
            ->exists();
    }

    /**
     * Count payments currently mid-flight against this plan. Used so the
     * deactivation guard can refuse to disable a plan while a checkout has
     * already started — the PayX webhook would arrive on a deactivated plan
     * and the user would lose money with no subscription to show for it.
     */
    public function pendingPaymentsCount(): int
    {
        return BillingPayment::query()
            ->where('plan_id', $this->id)
            ->where('status', BillingPayment::STATUS_PENDING)
            ->count();
    }
}
