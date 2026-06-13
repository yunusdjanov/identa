<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\SerializesRecordActors;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use App\Services\TreatmentImageService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TreatmentResource extends JsonResource
{
    use SerializesRecordActors;

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

        // Treatment routes are gated by `patients.view`/`patients.manage`
        // at the route layer — financial fields (cost/debt/paid/balance)
        // are present on every record but should only be exposed to
        // viewers with `payments.view`. Without this gate, an assistant
        // restricted to clinical data still receives the full money
        // payload via the API even though the UI hides it; a network-tab
        // inspector or scripted client defeats the frontend filter.
        // Mirrors the same intent enforced by DashboardService and
        // PatientService::overview's includePayments branch.
        // Multi-guard resolution: production uses Sanctum tokens
        // (`$request->user()` covers it); tests use `actingAs($u, 'web')`
        // which puts the user in the web guard. Without checking both,
        // legitimate dentist viewers would have their financial fields
        // scrubbed in tests, masking real coverage of the scrubbing
        // behavior. Production behavior is unchanged — sanctum's
        // session/token resolution wins on the first hit.
        $viewer = $request->user()
            ?? auth()->guard('sanctum')->user()
            ?? auth()->guard('web')->user();
        $canViewFinancials = $viewer instanceof User
            && $viewer->hasPermission(User::PERMISSION_PAYMENTS_VIEW);

        return [
            'id' => (string) $treatment->id,
            'patient_id' => (string) $treatment->patient_id,
            'tooth_number' => $treatment->tooth_number,
            'teeth' => $teeth,
            'treatment_type' => $treatment->treatment_type,
            'description' => $treatment->description,
            'comment' => $treatment->comment,
            'treatment_date' => $treatment->treatment_date?->toDateString(),
            'cost' => $canViewFinancials ? $debtAmount : null,
            'debt_amount' => $canViewFinancials ? $debtAmount : null,
            'paid_amount' => $canViewFinancials ? $paidAmount : null,
            'balance' => $canViewFinancials ? round($debtAmount - $paidAmount, 2) : null,
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
            'created_by' => $this->actorSummary($treatment, 'createdBy'),
            'updated_by' => $this->actorSummary($treatment, 'updatedBy'),
            'patient_name' => $treatment->relationLoaded('patient') ? $treatment->patient?->full_name : null,
            'patient_phone' => $treatment->relationLoaded('patient') ? $treatment->patient?->phone : null,
            'patient_secondary_phone' => $treatment->relationLoaded('patient') ? $treatment->patient?->secondary_phone : null,
            'patient_code' => $treatment->relationLoaded('patient') ? $treatment->patient?->patient_id : null,
        ];
    }
}
