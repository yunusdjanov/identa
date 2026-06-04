<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;

/**
 * Replay-protection ledger for PayX webhooks. Every incoming PayX webhook
 * is recorded here with its outcome so the same transaction_id cannot drive
 * a second subscription renewal.
 *
 * @property int $id
 * @property string $transaction_id
 * @property string $amount
 * @property string $currency
 * @property \Illuminate\Support\Carbon $received_at
 * @property string|null $billing_payment_id
 * @property string $result_status
 * @property string|null $rejection_reason
 * @property string|null $ip_address
 */
class PayxWebhookEvent extends Model
{
    public const RESULT_ACCEPTED = 'accepted';
    public const RESULT_REJECTED_REPLAY = 'rejected_replay';
    public const RESULT_REJECTED_VALIDATION = 'rejected_validation';
    public const RESULT_REJECTED_TERMINAL = 'rejected_terminal';

    protected $guarded = ['id'];

    protected $casts = [
        'received_at' => 'datetime',
    ];

    protected function billingPaymentId(): Attribute
    {
        // Stored as string for forward-compat with uuid PKs even when the
        // current billing_payments table uses bigInt.
        return Attribute::make(get: static fn ($value) => $value === null ? null : (string) $value);
    }
}
