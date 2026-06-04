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
            // `notes` is the dentist-entered short note attached on quick-payment
            // create (e.g. "partial — remainder next visit"). Surface it so the
            // POST response round-trips and the patient/treatment payment list
            // can render it. Earlier this was stubbed to `null` while the column
            // was added — restoring the real field now that the migration ships.
            'notes' => $payment->notes,
            'created_at' => $payment->created_at?->toIso8601String(),
        ];
    }
}
