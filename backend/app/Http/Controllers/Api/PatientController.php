<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\PreparePatientPhotoUploadRequest;
use App\Http\Requests\StorePatientRequest;
use App\Http\Requests\UpdatePatientRequest;
use App\Http\Resources\PatientResource;
use App\Models\Patient;
use App\Services\PatientClinicalPhotoService;
use App\Services\PatientPhotoService;
use App\Services\PatientService;
use App\Support\AuditLogger;
use App\Support\MediaUploadLimits;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PatientController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly PatientService $patients,
        private readonly PatientPhotoService $photos,
        private readonly PatientClinicalPhotoService $clinicalPhotos,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $patients = $this->patients->list($request);

        return response()->json([
            'data' => $patients
                ->getCollection()
                ->map(fn (Patient $patient): array => $this->transformPatient($patient, $request, false))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $patients->currentPage(),
                    'per_page' => $patients->perPage(),
                    'total' => $patients->total(),
                    'total_pages' => $patients->lastPage(),
                ],
            ],
        ]);
    }

    public function lookup(Request $request): JsonResponse
    {
        $patients = $this->patients->lookup($request);

        return response()->json([
            'data' => $patients
                ->getCollection()
                ->map(static fn (Patient $patient): array => [
                    'id' => (string) $patient->id,
                    'patient_id' => $patient->patient_id,
                    'full_name' => $patient->full_name,
                    'phone' => $patient->phone,
                    'secondary_phone' => $patient->secondary_phone,
                ])
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $patients->currentPage(),
                    'per_page' => $patients->perPage(),
                    'total' => $patients->total(),
                    'total_pages' => $patients->lastPage(),
                ],
            ],
        ]);
    }

    /**
     * Return profile-scoped recently opened patients for the current user.
     */
    public function recent(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->patients->recent($request)
                ->map(static fn (Patient $patient): array => [
                    'id' => (string) $patient->id,
                    'full_name' => $patient->full_name,
                ])
                ->values()
                ->all(),
        ]);
    }

    /**
     * Clear all recent patient shortcuts for the current user.
     */
    public function clearRecent(Request $request): JsonResponse
    {
        $this->patients->clearRecent($request);

        return response()->json([], 204);
    }

    /**
     * Remove one recent patient shortcut for the current user.
     */
    public function forgetRecent(Request $request, string $id): JsonResponse
    {
        $this->patients->forgetRecent($request, $id);

        return response()->json([], 204);
    }

    public function store(StorePatientRequest $request): JsonResponse
    {
        $patient = $this->patients->create($request);

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $patient = $this->patients->ownedPatient($request, $id);

        if ($request->boolean('remember_recent')) {
            $this->patients->rememberRecent($request, $patient);
        }

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ]);
    }

    public function overview(Request $request, string $id): JsonResponse
    {
        return response()->json([
            'data' => $this->patients->overview($request, $id),
        ]);
    }

    public function update(UpdatePatientRequest $request, string $id): JsonResponse
    {
        $patient = $this->patients->update($request, $id);

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ]);
    }

    public function uploadPhoto(Request $request, string $id): JsonResponse
    {
        $patient = $this->patients->ownedPatient($request, $id);
        $this->patients->ensureNotArchived($patient, __('api.patients.archived_restore_before_edit'));

        $validated = $request->validate([
            'photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:'.MediaUploadLimits::maxKilobytes()],
        ]);

        /** @var UploadedFile $uploadedPhoto */
        $uploadedPhoto = $validated['photo'];
        $patient = $this->photos->uploadQueued($patient, $uploadedPhoto, $this->patients->subscriptionOwner($request));

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.photo.updated',
            entityType: 'patient',
            entityId: (string) $patient->id,
        );

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ]);
    }

    public function preparePhotoUpload(
        PreparePatientPhotoUploadRequest $request,
        string $id
    ): JsonResponse {
        $patient = $this->patients->ownedPatient($request, $id);
        $this->patients->ensureNotArchived($patient, __('api.patients.archived_restore_before_edit'));

        return response()->json([
            'data' => $this->photos->prepare(
                dentistId: $this->patients->dentistId($request),
                patient: $patient,
                owner: $this->patients->subscriptionOwner($request),
                validated: $request->validated(),
            ),
        ]);
    }

    public function finalizePhotoUpload(
        Request $request,
        string $id,
        string $uploadId
    ): JsonResponse {
        $patient = $this->patients->ownedPatient($request, $id);
        $this->patients->ensureNotArchived($patient, __('api.patients.archived_restore_before_edit'));

        $patient = $this->photos->finalize(
            patient: $patient,
            dentistId: $this->patients->dentistId($request),
            owner: $this->patients->subscriptionOwner($request),
            uploadId: $uploadId,
        );

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.photo.updated',
            entityType: 'patient',
            entityId: (string) $patient->id,
            metadata: [
                'direct_upload' => true,
            ],
        );

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ]);
    }

    public function downloadPhoto(Request $request, string $id): StreamedResponse
    {
        return $this->photos->stream($request, $this->patients->ownedPatient($request, $id));
    }

    public function deletePhoto(Request $request, string $id): JsonResponse
    {
        $patient = $this->patients->ownedPatient($request, $id);
        $this->patients->ensureNotArchived($patient, __('api.patients.archived_restore_before_edit'));

        $this->photos->delete($patient);
        $patient->forceFill([
            'photo_disk' => null,
            'photo_path' => null,
            'scan_status' => 'approved',
            'scan_result' => null,
            'scan_provider' => null,
            'quarantine_path' => null,
            'approved_at' => null,
            'scanned_at' => null,
            'rejected_at' => null,
        ])->save();

        $patient = $this->patients->ownedPatient($request, $id);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.photo.deleted',
            entityType: 'patient',
            entityId: (string) $patient->id,
        );

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ]);
    }

    public function uploadOralPhoto(Request $request, string $id, ?string $viewType = null): JsonResponse
    {
        $patient = $this->patients->ownedPatient($request, $id);
        $this->patients->ensureNotArchived($patient, __('api.patients.archived_restore_before_edit'));
        $viewType = $this->clinicalPhotos->normalizeViewType($viewType);

        $validated = $request->validate([
            'photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:'.MediaUploadLimits::maxKilobytes()],
        ]);

        /** @var UploadedFile $uploadedPhoto */
        $uploadedPhoto = $validated['photo'];
        $this->clinicalPhotos->uploadPrimaryOralQueued(
            $patient,
            $uploadedPhoto,
            $this->patients->subscriptionOwner($request),
            $viewType
        );

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.oral_photo.updated',
            entityType: 'patient',
            entityId: (string) $patient->id,
            metadata: [
                'view_type' => $viewType,
            ],
        );

        return response()->json([
            'data' => $this->transformPatient($this->patients->ownedPatient($request, $id), $request),
        ]);
    }

    public function prepareOralPhotoUpload(
        PreparePatientPhotoUploadRequest $request,
        string $id,
        ?string $viewType = null
    ): JsonResponse {
        $patient = $this->patients->ownedPatient($request, $id);
        $this->patients->ensureNotArchived($patient, __('api.patients.archived_restore_before_edit'));
        $viewType = $this->clinicalPhotos->normalizeViewType($viewType);

        return response()->json([
            'data' => $this->clinicalPhotos->preparePrimaryOral(
                dentistId: $this->patients->dentistId($request),
                patient: $patient,
                owner: $this->patients->subscriptionOwner($request),
                validated: $request->validated(),
                viewType: $viewType,
            ),
        ]);
    }

    public function finalizeOralPhotoUpload(
        Request $request,
        string $id,
        string $viewType,
        string $uploadId
    ): JsonResponse {
        $patient = $this->patients->ownedPatient($request, $id);
        $this->patients->ensureNotArchived($patient, __('api.patients.archived_restore_before_edit'));
        $viewType = $this->clinicalPhotos->normalizeViewType($viewType);

        $this->clinicalPhotos->finalizePrimaryOral(
            patient: $patient,
            dentistId: $this->patients->dentistId($request),
            owner: $this->patients->subscriptionOwner($request),
            uploadId: $uploadId,
            viewType: $viewType,
        );

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.oral_photo.updated',
            entityType: 'patient',
            entityId: (string) $patient->id,
            metadata: [
                'direct_upload' => true,
                'view_type' => $viewType,
            ],
        );

        return response()->json([
            'data' => $this->transformPatient($this->patients->ownedPatient($request, $id), $request),
        ]);
    }

    public function finalizeLegacyOralPhotoUpload(
        Request $request,
        string $id,
        string $uploadId
    ): JsonResponse {
        return $this->finalizeOralPhotoUpload($request, $id, 'smile', $uploadId);
    }

    public function downloadOralPhoto(Request $request, string $id, ?string $viewType = null): StreamedResponse
    {
        $patient = $this->patients->ownedPatient($request, $id);
        $variant = $request->query('variant');
        $viewType = $this->clinicalPhotos->normalizeViewType($viewType);

        return $this->clinicalPhotos->stream(
            $this->clinicalPhotos->oralPhotoOrFail($patient, $viewType),
            is_string($variant) && $variant !== '' ? $variant : null
        );
    }

    public function downloadOralPhotoItem(
        Request $request,
        string $id,
        string $viewType,
        string $photoId
    ): StreamedResponse {
        $patient = $this->patients->ownedPatient($request, $id);
        $variant = $request->query('variant');
        $viewType = $this->clinicalPhotos->normalizeViewType($viewType);

        return $this->clinicalPhotos->stream(
            $this->clinicalPhotos->oralPhotoItemOrFail($patient, $viewType, $photoId),
            is_string($variant) && $variant !== '' ? $variant : null
        );
    }

    public function deleteOralPhoto(Request $request, string $id, ?string $viewType = null): JsonResponse
    {
        $patient = $this->patients->ownedPatient($request, $id);
        $this->patients->ensureNotArchived($patient, __('api.patients.archived_restore_before_edit'));
        $viewType = $this->clinicalPhotos->normalizeViewType($viewType);
        $photo = $this->clinicalPhotos->oralPhotoOrFail($patient, $viewType);

        $this->clinicalPhotos->delete($photo);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.oral_photo.deleted',
            entityType: 'patient',
            entityId: (string) $patient->id,
            metadata: [
                'view_type' => $viewType,
                'photo_id' => (string) $photo->id,
            ],
        );

        return response()->json([
            'data' => $this->transformPatient($this->patients->ownedPatient($request, $id), $request),
        ]);
    }

    public function deleteOralPhotoItem(
        Request $request,
        string $id,
        string $viewType,
        string $photoId
    ): JsonResponse {
        $patient = $this->patients->ownedPatient($request, $id);
        $this->patients->ensureNotArchived($patient, __('api.patients.archived_restore_before_edit'));
        $viewType = $this->clinicalPhotos->normalizeViewType($viewType);
        $photo = $this->clinicalPhotos->oralPhotoItemOrFail($patient, $viewType, $photoId);

        $this->clinicalPhotos->delete($photo);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.oral_photo.deleted',
            entityType: 'patient',
            entityId: (string) $patient->id,
            metadata: [
                'view_type' => $viewType,
                'photo_id' => $photoId,
            ],
        );

        return response()->json([
            'data' => $this->transformPatient($this->patients->ownedPatient($request, $id), $request),
        ]);
    }

    public function replaceOralPhotoItem(
        Request $request,
        string $id,
        string $viewType,
        string $photoId
    ): JsonResponse {
        $patient = $this->patients->ownedPatient($request, $id);
        $this->patients->ensureNotArchived($patient, __('api.patients.archived_restore_before_edit'));
        $viewType = $this->clinicalPhotos->normalizeViewType($viewType);

        $validated = $request->validate([
            'photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:'.MediaUploadLimits::maxKilobytes()],
        ]);

        /** @var UploadedFile $uploadedPhoto */
        $uploadedPhoto = $validated['photo'];
        $photo = $this->clinicalPhotos->oralPhotoItemOrFail($patient, $viewType, $photoId);
        $this->clinicalPhotos->replaceQueued(
            $patient,
            $photo,
            $uploadedPhoto,
            $this->patients->subscriptionOwner($request)
        );

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'patient.oral_photo.replaced',
            entityType: 'patient',
            entityId: (string) $patient->id,
            metadata: [
                'view_type' => $viewType,
                'photo_id' => $photoId,
            ],
        );

        return response()->json([
            'data' => $this->transformPatient($this->patients->ownedPatient($request, $id), $request),
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $this->patients->archive($request, $id);

        return response()->json([], 204);
    }

    public function restore(Request $request, string $id): JsonResponse
    {
        $patient = $this->patients->restore($request, $id);

        return response()->json([
            'data' => $this->transformPatient($patient, $request),
        ]);
    }

    public function forceDestroy(Request $request, string $id): JsonResponse
    {
        $this->patients->forceDelete($request, $id);

        return response()->json([], 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformPatient(Patient $patient, ?Request $request = null, bool $includeClinicalPhotos = true): array
    {
        return (new PatientResource(
            $patient,
            $this->photos,
            $this->clinicalPhotos,
            $includeClinicalPhotos
        ))->resolve($request ?? request());
    }
}
