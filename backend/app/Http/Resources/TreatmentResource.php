<?php

namespace App\Http\Resources;

use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Services\TreatmentImageService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TreatmentResource extends JsonResource
{
    public function __construct(
        Treatment $resource,
        private readonly TreatmentImageService $images,
        private readonly bool $includeImages = true,
        private readonly bool $includePrimaryImage = true
    ) {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Treatment $treatment */
        $treatment = $this->resource;
        $teeth = array_values(array_map(
            static fn (mixed $tooth): int => (int) $tooth,
            array_filter($treatment->teeth ?? [], static fn (mixed $tooth): bool => $tooth !== null && $tooth !== '')
        ));
        $debtAmount = $treatment->debt_amount !== null ? (float) $treatment->debt_amount : (float) ($treatment->cost ?? 0);
        $paidAmount = $treatment->paid_amount !== null ? (float) $treatment->paid_amount : 0.0;

        if ($this->includeImages) {
            $treatment->loadMissing('images');
        } elseif ($this->includePrimaryImage) {
            $treatment->loadMissing('primaryImage');
        }

        $imageCount = (int) ($treatment->images_count ?? ($this->includeImages ? $treatment->images->count() : 0));
        $primaryImage = $this->includeImages
            ? $treatment->images->first()
            : ($this->includePrimaryImage && $treatment->relationLoaded('primaryImage') ? $treatment->primaryImage : null);

        return [
            'id' => (string) $treatment->id,
            'patient_id' => (string) $treatment->patient_id,
            'tooth_number' => $treatment->tooth_number,
            'teeth' => $teeth,
            'treatment_type' => $treatment->treatment_type,
            'description' => $treatment->description,
            'comment' => $treatment->comment,
            'treatment_date' => $treatment->treatment_date?->toDateString(),
            'cost' => $debtAmount,
            'debt_amount' => $debtAmount,
            'paid_amount' => $paidAmount,
            'balance' => round($debtAmount - $paidAmount, 2),
            'notes' => $treatment->notes,
            'image_count' => $imageCount,
            'primary_image' => $primaryImage instanceof TreatmentImage
                ? (new TreatmentImageResource($primaryImage, $treatment, $this->images))->resolve($request)
                : null,
            'images' => $this->includeImages
                ? $treatment->images
                    ->map(fn (TreatmentImage $image): array => (new TreatmentImageResource($image, $treatment, $this->images))->resolve($request))
                    ->values()
                    ->all()
                : [],
            'created_at' => $treatment->created_at?->toIso8601String(),
            'updated_at' => $treatment->updated_at?->toIso8601String(),
            'patient_name' => $treatment->relationLoaded('patient') ? $treatment->patient?->full_name : null,
            'patient_phone' => $treatment->relationLoaded('patient') ? $treatment->patient?->phone : null,
            'patient_secondary_phone' => $treatment->relationLoaded('patient') ? $treatment->patient?->secondary_phone : null,
            'patient_code' => $treatment->relationLoaded('patient') ? $treatment->patient?->patient_id : null,
        ];
    }
}
