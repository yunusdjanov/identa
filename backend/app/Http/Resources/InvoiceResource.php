<?php

namespace App\Http\Resources;

use App\Models\Invoice;
use App\Models\InvoiceItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InvoiceResource extends JsonResource
{
    public function __construct(
        Invoice $resource,
        private readonly bool $includeItems = false,
    ) {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Invoice $invoice */
        $invoice = $this->resource;
        $payload = [
            'id' => (string) $invoice->id,
            'patient_id' => (string) $invoice->patient_id,
            'patient_name' => $invoice->patient?->full_name,
            'patient_phone' => $invoice->patient?->phone,
            'invoice_number' => $invoice->invoice_number,
            'total_amount' => (float) $invoice->total_amount,
            'paid_amount' => (float) $invoice->paid_amount,
            'balance' => (float) $invoice->balance,
            'status' => $invoice->status,
            'invoice_date' => $invoice->invoice_date?->toDateString(),
            'due_date' => null,
            'notes' => null,
        ];

        if ($this->includeItems) {
            $payload['items'] = $invoice->items
                ->map(fn (InvoiceItem $item): array => [
                    'id' => (string) $item->id,
                    'description' => $item->description,
                    'odontogram_entry_id' => $item->odontogram_entry_id !== null ? (string) $item->odontogram_entry_id : null,
                    'quantity' => $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'total_price' => (float) $item->total_price,
                ])
                ->values()
                ->all();
        }

        return $payload;
    }
}
