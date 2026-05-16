<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PrepareOdontogramEntryImageUploadRequest;
use App\Http\Requests\StoreOdontogramEntryRequest;
use App\Http\Requests\UpdateOdontogramEntryRequest;
use App\Http\Requests\UploadOdontogramEntryImageRequest;
use App\Http\Resources\OdontogramEntryResource;
use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\User;
use App\Services\OdontogramEntryService;
use App\Services\OdontogramImageService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientOdontogramController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly OdontogramEntryService $odontogramEntries,
        private readonly OdontogramImageService $odontogramImages,
    ) {}

    public function index(Request $request, string $id): JsonResponse
    {
        $result = $this->odontogramEntries->listForPatient($request, $id);
        $entries = $result['entries'];

        return response()->json([
            'data' => $entries
                ->getCollection()
                ->map(fn (OdontogramEntry $entry): array => $this->transformOdontogramEntry($entry))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $entries->currentPage(),
                    'per_page' => $entries->perPage(),
                    'total' => $entries->total(),
                    'total_pages' => $entries->lastPage(),
                ],
            ],
        ]);
    }

    public function store(StoreOdontogramEntryRequest $request, string $id): JsonResponse
    {
        $entry = $this->odontogramEntries->create($request, $id);

        return response()->json([
            'data' => $this->transformOdontogramEntry($entry),
        ], 201);
    }

    public function update(UpdateOdontogramEntryRequest $request, string $id, string $entryId): JsonResponse
    {
        $entry = $this->odontogramEntries->update($request, $id, $entryId);

        return response()->json([
            'data' => $this->transformOdontogramEntry($entry),
        ]);
    }

    public function destroy(Request $request, string $id, string $entryId): JsonResponse
    {
        $this->odontogramEntries->delete($request, $id, $entryId);

        return response()->json([], 204);
    }

    public function uploadImage(UploadOdontogramEntryImageRequest $request, string $id, string $entryId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_upload_images')],
            ]);
        }

        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $validated = $request->validated();
        $uploadedFile = $request->file('image');
        if ($uploadedFile === null) {
            throw ValidationException::withMessages([
                'image' => [__('api.odontogram.image_required')],
            ]);
        }

        $owner = $this->resolveSubscriptionOwner($request);
        $this->odontogramImages->uploadQueued(
            dentistId: $this->resolveDentistId($request),
            patient: $patient,
            entry: $entry,
            validated: $validated,
            uploadedFile: $uploadedFile,
            owner: $owner
        );
        $entry->load('images');

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.odontogram_entry.image.uploaded',
            entityType: 'odontogram_entry',
            entityId: (string) $entry->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'stage' => $validated['stage'],
            ],
        );

        return response()->json([
            'data' => $this->transformOdontogramEntry($entry),
        ]);
    }

    public function prepareImageUpload(
        PrepareOdontogramEntryImageUploadRequest $request,
        string $id,
        string $entryId
    ): JsonResponse {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_upload_images')],
            ]);
        }

        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $validated = $request->validated();
        $owner = $this->resolveSubscriptionOwner($request);

        return response()->json([
            'data' => $this->odontogramImages->prepare(
                dentistId: $this->resolveDentistId($request),
                patientId: (string) $patient->id,
                entry: $entry,
                owner: $owner,
                validated: $validated
            ),
        ]);
    }

    public function finalizeImageUpload(
        Request $request,
        string $id,
        string $entryId,
        string $uploadId
    ): JsonResponse {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_upload_images')],
            ]);
        }

        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $dentistId = $this->resolveDentistId($request);
        $owner = $this->resolveSubscriptionOwner($request);
        $image = $this->odontogramImages->finalize(
            entry: $entry,
            dentistId: $dentistId,
            patientId: (string) $patient->id,
            owner: $owner,
            uploadId: $uploadId
        );
        $entry->load('images');

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.odontogram_entry.image.uploaded',
            entityType: 'odontogram_entry',
            entityId: (string) $entry->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'stage' => (string) $image->stage,
                'direct_upload' => true,
            ],
        );

        return response()->json([
            'data' => $this->transformOdontogramEntry($entry),
        ]);
    }

    public function downloadImage(Request $request, string $id, string $entryId, string $imageId): StreamedResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $image = $this->odontogramImages->findOwnedImage($entry, $imageId);
        $variant = $request->query('variant');
        $variant = is_string($variant) && $variant !== '' ? $variant : null;

        return $this->odontogramImages->stream($image, $variant);
    }

    public function deleteImage(Request $request, string $id, string $entryId, string $imageId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.odontogram.archived_restore_before_delete_images')],
            ]);
        }

        $entry = $this->findOwnedEntry($request, (string) $patient->id, $entryId);
        $image = $this->odontogramImages->findOwnedImage($entry, $imageId);
        $stage = (string) $image->stage;

        $this->odontogramImages->deleteFile($image);
        $image->delete();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.odontogram_entry.image.deleted',
            entityType: 'odontogram_entry',
            entityId: (string) $entry->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'stage' => $stage,
            ],
        );

        return response()->json([], 204);
    }

    public function summary(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'data' => $this->odontogramEntries->summary($request, $id),
        ]);
    }

    private function findOwnedPatient(Request $request, string $id): Patient
    {
        return $this->odontogramEntries->ownedPatient($request, $id);
    }

    private function findOwnedEntry(Request $request, string $patientId, string $entryId): OdontogramEntry
    {
        return $this->odontogramEntries->ownedEntry($request, $patientId, $entryId);
    }

    private function resolveDentistId(Request $request): int
    {
        return $this->odontogramEntries->dentistId($request);
    }

    private function resolveSubscriptionOwner(Request $request): User
    {
        return $this->odontogramEntries->subscriptionOwner($request);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformOdontogramEntry(OdontogramEntry $entry): array
    {
        return (new OdontogramEntryResource(
            $entry,
            fn (OdontogramEntry $entry, OdontogramEntryImage $image, ?string $variant = null): ?string => $this->odontogramImages->buildUrl($entry, $image, $variant),
            fn (OdontogramEntryImage $image, string $variant): bool => $this->odontogramImages->variantReady($image, $variant)
        ))->resolve(request());
    }
}
