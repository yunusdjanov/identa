<?php

namespace App\Http\Resources;

use App\Models\Payment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PaymentResource extends JsonResource
{
    public function __construct(Payment $resource)
    {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Payment $payment */
        $payment = $this->resource;

        return [
            'id' => (string) $payment->id,
            'invoice_id' => (string) $payment->invoice_id,
            'patient_id' => (string) $payment->patient_id,
            'amount' => (float) $payment->amount,
            'payment_method' => $payment->payment_method,
            'payment_date' => $payment->payment_date?->toDateString(),
            'notes' => null,
            'created_at' => $payment->created_at?->toIso8601String(),
        ];
    }
}
