<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\FinalizeTreatmentImageBatchUploadRequest;
use App\Http\Requests\PrepareTreatmentImageBatchUploadRequest;
use App\Http\Requests\PrepareTreatmentImageUploadRequest;
use App\Http\Requests\StoreTreatmentRequest;
use App\Http\Requests\UpdateTreatmentRequest;
use App\Http\Requests\UploadTreatmentImageRequest;
use App\Http\Resources\TreatmentResource;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use App\Services\TreatmentImageDirectUploadService;
use App\Services\TreatmentImageService;
use App\Services\TreatmentService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientTreatmentController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly TreatmentService $treatments,
        private readonly TreatmentImageDirectUploadService $directUploadService,
        private readonly TreatmentImageService $treatmentImages,
    ) {}

    public function index(Request $request, string $id): JsonResponse
    {
        $result = $this->treatments->listForPatient($request, $id);
        $treatments = $result['treatments'];
        $includeImages = $result['include_images'];

        return response()->json([
            'data' => $treatments
                ->getCollection()
                ->map(fn (Treatment $treatment): array => $this->treatmentPayload($request, $treatment, $includeImages))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $treatments->currentPage(),
                    'per_page' => $treatments->perPage(),
                    'total' => $treatments->total(),
                    'total_pages' => $treatments->lastPage(),
                ],
                'summary' => $result['summary'],
            ],
        ]);
    }

    public function indexAll(Request $request): JsonResponse
    {
        $result = $this->treatments->listAll($request);
        $treatments = $result['treatments'];
        $includeImages = $result['include_images'];

        return response()->json([
            'data' => $treatments
                ->getCollection()
                ->map(fn (Treatment $treatment): array => $this->treatmentPayload(
                    $request,
                    $treatment,
                    $includeImages,
                    $includeImages
                ))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $treatments->currentPage(),
                    'per_page' => $treatments->perPage(),
                    'total' => $treatments->total(),
                    'total_pages' => $treatments->lastPage(),
                ],
                'summary' => $result['summary'],
            ],
        ]);
    }

    public function show(Request $request, string $id, string $treatmentId): JsonResponse
    {
        $treatment = $this->treatments->show($request, $id, $treatmentId);

        return response()->json([
            'data' => $this->treatmentPayload($request, $treatment, true),
        ]);
    }

    public function store(StoreTreatmentRequest $request, string $id): JsonResponse
    {
        $treatment = $this->treatments->create($request, $id);

        return response()->json([
            'data' => $this->treatmentPayload($request, $treatment, false),
        ], 201);
    }

    public function update(UpdateTreatmentRequest $request, string $id, string $treatmentId): JsonResponse
    {
        $treatment = $this->treatments->update($request, $id, $treatmentId);

        return response()->json([
            'data' => $this->treatmentPayload($request, $treatment, false),
        ]);
    }

    public function destroy(Request $request, string $id, string $treatmentId): JsonResponse
    {
        $this->treatments->delete($request, $id, $treatmentId);

        return response()->json([], 204);
    }

    public function uploadImage(UploadTreatmentImageRequest $request, string $id, string $treatmentId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_upload_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $uploadedFile = $request->file('image');
        if (! $uploadedFile instanceof UploadedFile) {
            throw ValidationException::withMessages([
                'image' => [__('api.treatments.image_required')],
            ]);
        }

        $owner = $this->resolveSubscriptionOwner($request);
        $image = $this->treatmentImages->uploadQueued(
            dentistId: $this->resolveDentistId($request),
            patient: $patient,
            treatment: $treatment,
            uploadedFile: $uploadedFile,
            owner: $owner
        );

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.image.uploaded',
            entityType: 'treatment',
            entityId: (string) $treatment->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'image_id' => (string) $image->id,
            ],
        );

        $treatment->load('images');

        return response()->json([
            'data' => $this->treatmentPayload($request, $treatment, true),
        ], 201);
    }

    public function prepareImageUpload(
        PrepareTreatmentImageUploadRequest $request,
        string $id,
        string $treatmentId
    ): JsonResponse {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_upload_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $validated = $request->validated();
        $owner = $this->resolveSubscriptionOwner($request);

        return response()->json([
            'data' => $this->directUploadService->prepare(
                dentistId: $this->resolveDentistId($request),
                patientId: (string) $patient->id,
                treatment: $treatment,
                owner: $owner,
                file: [
                    'filename' => (string) $validated['filename'],
                    'content_type' => (string) $validated['content_type'],
                    'file_size' => (int) $validated['file_size'],
                ]
            ),
        ]);
    }

    public function prepareImageBatchUpload(
        PrepareTreatmentImageBatchUploadRequest $request,
        string $id,
        string $treatmentId
    ): JsonResponse {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_upload_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $validated = $request->validated();

        return response()->json([
            'data' => $this->directUploadService->prepareBatch(
                dentistId: $this->resolveDentistId($request),
                patientId: (string) $patient->id,
                treatment: $treatment,
                files: array_values($validated['files'])
            ),
        ]);
    }

    public function finalizeImageUpload(
        Request $request,
        string $id,
        string $treatmentId,
        string $uploadId
    ): JsonResponse {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_upload_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $dentistId = $this->resolveDentistId($request);
        $owner = $this->resolveSubscriptionOwner($request);
        $image = $this->directUploadService->finalize(
            treatment: $treatment,
            dentistId: $dentistId,
            patientId: (string) $patient->id,
            owner: $owner,
            uploadId: $uploadId
        );

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.image.uploaded',
            entityType: 'treatment',
            entityId: (string) $treatment->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'image_id' => (string) $image->id,
                'direct_upload' => true,
            ],
        );

        $treatment->load('images');

        return response()->json([
            'data' => $this->treatmentPayload($request, $treatment, true),
        ], 201);
    }

    public function finalizeImageBatchUpload(
        FinalizeTreatmentImageBatchUploadRequest $request,
        string $id,
        string $treatmentId
    ): JsonResponse {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_upload_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $validated = $request->validated();
        $result = $this->directUploadService->finalizeBatch(
            treatment: $treatment,
            dentistId: $this->resolveDentistId($request),
            patientId: (string) $patient->id,
            uploadIds: array_values($validated['upload_ids'])
        );

        if ($result['completed'] !== []) {
            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'patient.treatment.images.uploaded',
                entityType: 'treatment',
                entityId: (string) $treatment->id,
                metadata: [
                    'patient_id' => (string) $patient->id,
                    'image_count' => count($result['completed']),
                    'direct_upload' => true,
                    'batch' => true,
                ],
            );
        }

        return response()->json([
            'data' => [
                'completed_count' => count($result['completed']),
                'failed' => $result['failed'],
            ],
        ], $result['failed'] === [] ? 201 : 207);
    }

    public function downloadImage(Request $request, string $id, string $treatmentId, string $imageId): StreamedResponse
    {
        $image = $this->treatmentImages->findApprovedImageForMedia(
            dentistId: $this->resolveDentistId($request),
            patientId: $id,
            treatmentId: $treatmentId,
            imageId: $imageId
        );

        return $this->treatmentImages->stream($request, $image);
    }

    public function deleteImage(Request $request, string $id, string $treatmentId, string $imageId): JsonResponse
    {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_delete_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $image = $this->treatmentImages->findOwnedImage($treatment, $imageId);
        $this->treatmentImages->deleteFile($image);
        $image->delete();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.image.deleted',
            entityType: 'treatment',
            entityId: (string) $treatment->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'image_id' => (string) $image->id,
            ],
        );

        return response()->json([], 204);
    }

    public function replaceImage(
        UploadTreatmentImageRequest $request,
        string $id,
        string $treatmentId,
        string $imageId
    ): JsonResponse {
        $patient = $this->findOwnedPatient($request, $id);
        if ($patient->trashed()) {
            throw ValidationException::withMessages([
                'patient' => [__('api.treatments.archived_restore_before_upload_images')],
            ]);
        }

        $treatment = $this->findOwnedTreatment($request, (string) $patient->id, $treatmentId);
        $image = $this->treatmentImages->findOwnedImage($treatment, $imageId);
        $uploadedFile = $request->file('image');
        if (! $uploadedFile instanceof UploadedFile) {
            throw ValidationException::withMessages([
                'image' => [__('api.treatments.image_required')],
            ]);
        }

        $this->treatmentImages->replaceQueued(
            dentistId: $this->resolveDentistId($request),
            patient: $patient,
            treatment: $treatment,
            image: $image,
            uploadedFile: $uploadedFile,
            owner: $this->resolveSubscriptionOwner($request)
        );

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.treatment.image.replaced',
            entityType: 'treatment',
            entityId: (string) $treatment->id,
            metadata: [
                'patient_id' => (string) $patient->id,
                'image_id' => (string) $image->id,
            ],
        );

        $treatment->load('images');

        return response()->json([
            'data' => $this->treatmentPayload($request, $treatment, true),
        ]);
    }

    private function findOwnedPatient(Request $request, string $id): Patient
    {
        return $this->treatments->ownedPatient($request, $id);
    }

    private function resolveDentistId(Request $request): int
    {
        return $this->treatments->dentistId($request);
    }

    private function resolveSubscriptionOwner(Request $request): User
    {
        return $this->treatments->subscriptionOwner($request);
    }

    /**
     * @return array<string, mixed>
     */
    private function treatmentPayload(
        Request $request,
        Treatment $treatment,
        bool $includeImages = true,
        bool $includePrimaryImage = true
    ): array {
        return (new TreatmentResource(
            $treatment,
            $this->treatmentImages,
            $includeImages,
            $includePrimaryImage
        ))->resolve($request);
    }

    private function findOwnedTreatment(Request $request, string $patientId, string $treatmentId): Treatment
    {
        return $this->treatments->ownedTreatment($request, $patientId, $treatmentId);
    }
}
