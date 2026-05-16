<?php

namespace App\Http\Resources;

use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OdontogramEntryResource extends JsonResource
{
    /**
     * @param  callable(OdontogramEntry, OdontogramEntryImage, string|null): ?string  $urlResolver
     * @param  callable(OdontogramEntryImage, string): bool  $variantReadyResolver
     */
    public function __construct(
        OdontogramEntry $resource,
        private readonly mixed $urlResolver,
        private readonly mixed $variantReadyResolver
    ) {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var OdontogramEntry $entry */
        $entry = $this->resource;

        return [
            'id' => (string) $entry->id,
            'patient_id' => (string) $entry->patient_id,
            'tooth_number' => $entry->tooth_number,
            'condition_type' => $entry->condition_type,
            'surface' => $entry->surface,
            'material' => $entry->material,
            'severity' => $entry->severity,
            'condition_date' => $entry->condition_date?->toDateString(),
            'notes' => $entry->notes,
            'created_at' => $entry->created_at?->toIso8601String(),
            'images' => $entry->images
                ->sortBy('stage')
                ->map(fn (OdontogramEntryImage $image): array => (new OdontogramImageResource(
                    $image,
                    $entry,
                    $this->urlResolver,
                    $this->variantReadyResolver
                ))->resolve($request))
                ->values()
                ->all(),
        ];
    }
}
