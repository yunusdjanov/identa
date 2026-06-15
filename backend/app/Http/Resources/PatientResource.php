<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\SerializesRecordActors;
use App\Models\Patient;
use App\Services\PatientClinicalPhotoService;
use App\Services\PatientPhotoService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PatientResource extends JsonResource
{
    use SerializesRecordActors;

    public function __construct(
        Patient $resource,
        private readonly PatientPhotoService $photos,
        private readonly PatientClinicalPhotoService $clinicalPhotos,
    ) {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Patient $patient */
        $patient = $this->resource;
        $photoDisk = is_string($patient->photo_disk) && $patient->photo_disk !== ''
            ? $patient->photo_disk
            : $this->photos->disk();
        $patient->loadMissing('oralPhotos');
        $oralPhotos = $this->clinicalPhotos->resourceCollectionPayload($patient, $patient->oralPhotos, $request);

        return [
            'id' => (string) $patient->id,
            'patient_id' => $patient->patient_id,
            'full_name' => $patient->full_name,
            'phone' => $patient->phone,
            'secondary_phone' => $patient->secondary_phone,
            'address' => $patient->address,
            'date_of_birth' => $patient->date_of_birth?->toDateString(),
            'gender' => $patient->gender,
            'medical_history' => $patient->medical_history,
            'allergies' => $patient->allergies,
            'current_medications' => $patient->current_medications,
            'photo_scan_status' => $this->photos->displayScanStatus($patient),
            'photo_url' => $this->photos->url($patient, $request),
            'photo_thumbnail_url' => $this->photos->url($patient, $request, PatientPhotoService::IMAGE_VARIANT_THUMBNAIL),
            'photo_preview_url' => $this->photos->url($patient, $request, PatientPhotoService::IMAGE_VARIANT_PREVIEW),
            'photo_thumbnail_ready' => $this->photos->variantReady(
                $photoDisk,
                $patient,
                PatientPhotoService::IMAGE_VARIANT_THUMBNAIL
            ),
            'photo_preview_ready' => $this->photos->variantReady(
                $photoDisk,
                $patient,
                PatientPhotoService::IMAGE_VARIANT_PREVIEW
            ),
            'oral_photo' => $oralPhotos['smile'] ?? null,
            'oral_photos' => $oralPhotos,
            'created_at' => $patient->created_at?->toIso8601String(),
            'updated_at' => $patient->updated_at?->toIso8601String(),
            'created_by' => $this->actorSummary($patient, 'createdBy'),
            'updated_by' => $this->actorSummary($patient, 'updatedBy'),
            'is_archived' => $patient->trashed(),
            'archived_at' => $patient->deleted_at?->toIso8601String(),
            'last_visit_at' => $this->resolveLastVisitAt($patient),
            'categories' => $patient->categories
                ->sortBy('sort_order')
                ->values()
                ->map(fn ($category): array => [
                    'id' => (string) $category->id,
                    'name' => $category->name,
                    'color' => $category->color,
                    'sort_order' => (int) $category->sort_order,
                ])
                ->all(),
        ];
    }

    private function resolveLastVisitAt(Patient $patient): ?string
    {
        $lastCompletedAppointmentAt = $this->normalizeDateValue($patient->getAttribute('last_completed_appointment_at'));
        $lastOdontogramVisitAt = $this->normalizeDateValue($patient->getAttribute('last_odontogram_visit_at'));
        $lastTreatmentVisitAt = $this->normalizeDateValue($patient->getAttribute('last_treatment_visit_at'));
        $visitDates = array_filter([
            $lastCompletedAppointmentAt,
            $lastOdontogramVisitAt,
            $lastTreatmentVisitAt,
        ], static fn (?string $visitDate): bool => $visitDate !== null);

        return $visitDates === [] ? null : max($visitDates);
    }

    private function normalizeDateValue(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $normalized = substr((string) $value, 0, 10);
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $normalized) !== 1) {
            return null;
        }

        return $normalized;
    }
}
