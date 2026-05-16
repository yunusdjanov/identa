<?php

namespace App\Http\Resources;

use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Services\TreatmentImageService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TreatmentImageResource extends JsonResource
{
    public function __construct(
        TreatmentImage $resource,
        private readonly Treatment $treatment,
        private readonly TreatmentImageService $images
    ) {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var TreatmentImage $image */
        $image = $this->resource;

        return $this->images->payload($this->treatment, $image);
    }
}
