<?php

namespace App\Http\Resources;

use App\Models\BillingPayment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BillingPaymentResource extends JsonResource
{
    public function __construct(BillingPayment $resource)
    {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var BillingPayment $payment */
        $payment = $this->resource;

        return [
            'id' => (string) $payment->id,
            'plan_code' => $payment->plan_code,
            'plan_name' => $payment->plan_name,
            'billing_period' => $payment->billing_period,
            'amount' => (float) $payment->amount,
            'currency' => $payment->currency,
            'status' => $payment->status,
            'provider' => $payment->provider,
            'provider_payment_id' => $payment->provider_payment_id,
            'provider_order_id' => $payment->provider_order_id,
            'paid_at' => $payment->paid_at?->toIso8601String(),
            'created_at' => $payment->created_at?->toIso8601String(),
        ];
    }
}
