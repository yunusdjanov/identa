<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BillingPayment extends Model
{
    /** @use HasFactory<\Database\Factories\BillingPaymentFactory> */
    use HasFactory;

    public const STATUS_PENDING = 'pending';
    public const STATUS_PAID = 'paid';
    public const STATUS_FAILED = 'failed';
    public const STATUS_CANCELED = 'canceled';
    public const STATUS_REFUNDED = 'refunded';
    public const PROVIDER_PAYX = 'payx';
    /**
     * Admin-recorded off-line receipt (cash, p2p transfer, bank transfer).
     * The merchant collects the money outside the system; this row is the
     * audit/reconciliation record so the same refund + history surfaces
     * apply to admin-recorded revenue as PayX revenue.
     */
    public const PROVIDER_MANUAL_ADMIN = 'manual_admin';

    /**
     * Mass-assignable attributes. Provider-side identity fields
     * (provider_payment_id, provider_order_id, provider_payload, status, paid_at)
     * are intentionally excluded — they belong to the payment lifecycle
     * machinery (createCheckout, webhook handler, refund) and must only be set
     * via `forceFill` in trusted service code. This blocks any future endpoint
     * from accidentally letting tenant input rewrite a transaction identifier.
     *
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'subscription_id',
        'plan_id',
        'plan_code',
        'plan_name',
        'billing_period',
        'amount',
        'currency',
        'provider',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'provider_payload' => 'array',
            'paid_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, BillingPayment>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Subscription, BillingPayment>
     */
    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }

    /**
     * @return BelongsTo<Plan, BillingPayment>
     */
    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }
}
