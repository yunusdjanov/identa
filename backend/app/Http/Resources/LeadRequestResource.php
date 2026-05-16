<?php

namespace App\Http\Resources;

use App\Models\LeadRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LeadRequestResource extends JsonResource
{
    public function __construct(LeadRequest $resource)
    {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var LeadRequest $leadRequest */
        $leadRequest = $this->resource;

        return [
            'id' => (string) $leadRequest->id,
            'name' => $leadRequest->name,
            'phone' => $leadRequest->phone,
            'clinic_name' => $leadRequest->clinic_name,
            'city' => $leadRequest->city,
            'note' => $leadRequest->note,
            'status' => $leadRequest->status,
            'handled_at' => $leadRequest->handled_at?->toIso8601String(),
            'created_at' => $leadRequest->created_at?->toIso8601String(),
        ];
    }
}
