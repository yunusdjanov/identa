<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ListPaymentLedgerRequest;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use App\Services\PatientPhotoService;
use App\Services\PaymentLedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentLedgerController extends Controller
{
    public function __construct(
        private readonly PaymentLedgerService $ledger,
        private readonly PatientPhotoService $photos,
    ) {}

    /**
     * GET /api/v1/payments/ledger/patients
     *
     * Auth: payments.view. Query: page, per_page, filter[patient_id],
     * filter[search], filter[outstanding], include_patient_photo, include_summary.
     * Returns patient-level balances and optional summary totals.
     */
    public function patients(ListPaymentLedgerRequest $request): JsonResponse
    {
        $result = $this->ledger->listPatientBalances($request);
        $rows = $result['rows'];
        $includePatientProfile = $request->filled('filter.patient_id');
        $includePatientPhoto = $includePatientProfile || $request->boolean('include_patient_photo');

        $meta = [
            'pagination' => [
                'page' => $rows->currentPage(),
                'per_page' => $rows->perPage(),
                'total' => $rows->total(),
                'total_pages' => $rows->lastPage(),
            ],
        ];
        if ($result['summary'] !== null) {
            $meta['summary'] = $result['summary'];
        }

        return response()->json([
            'data' => $rows
                ->getCollection()
                ->map(fn (Patient $patient): array => $this->patientRow(
                    $patient,
                    $request,
                    $includePatientProfile,
                    $includePatientPhoto
                ))
                ->values()
                ->all(),
            'meta' => $meta,
        ]);
    }

    /**
     * GET /api/v1/payments/ledger/history
     *
     * Auth: payments.view. Query: page, per_page, filter[patient_id],
     * filter[search], filter[outstanding], include_summary. Returns
     * treatment-ledger rows and optional summary totals.
     */
    public function history(ListPaymentLedgerRequest $request): JsonResponse
    {
        $result = $this->ledger->listHistoryRows($request);
        $rows = $result['rows'];

        $meta = [
            'pagination' => [
                'page' => $rows->currentPage(),
                'per_page' => $rows->perPage(),
                'total' => $rows->total(),
                'total_pages' => $rows->lastPage(),
            ],
        ];
        if ($result['summary'] !== null) {
            $meta['summary'] = $result['summary'];
        }

        return response()->json([
            'data' => $rows
                ->getCollection()
                ->map(fn (Treatment $treatment): array => $this->historyRow($treatment))
                ->values()
                ->all(),
            'meta' => $meta,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function patientRow(
        Patient $patient,
        Request $request,
        bool $includePatientProfile,
        bool $includePatientPhoto
    ): array
    {
        $payload = [
            'patient_id' => (string) $patient->id,
            'patient_code' => $patient->getAttribute('patient_code'),
            'patient_name' => $patient->full_name,
            'patient_phone' => $patient->phone,
            'patient_secondary_phone' => $patient->secondary_phone,
        ];

        if ($includePatientPhoto) {
            $photoDisk = is_string($patient->photo_disk) && $patient->photo_disk !== ''
                ? $patient->photo_disk
                : $this->photos->disk();
            $payload += [
                'patient_photo_scan_status' => $this->photos->displayScanStatus($patient),
                'patient_photo_url' => $this->photos->url($patient, $request),
                'patient_photo_thumbnail_url' => $this->photos->url(
                    $patient,
                    $request,
                    PatientPhotoService::IMAGE_VARIANT_THUMBNAIL
                ),
                'patient_photo_preview_url' => $this->photos->url(
                    $patient,
                    $request,
                    PatientPhotoService::IMAGE_VARIANT_PREVIEW
                ),
                'patient_photo_thumbnail_ready' => $this->photos->variantReady(
                    $photoDisk,
                    $patient,
                    PatientPhotoService::IMAGE_VARIANT_THUMBNAIL
                ),
                'patient_photo_preview_ready' => $this->photos->variantReady(
                    $photoDisk,
                    $patient,
                    PatientPhotoService::IMAGE_VARIANT_PREVIEW
                ),
            ];
        }

        if ($includePatientProfile) {
            $payload += [
                'patient_address' => $patient->address,
                'patient_date_of_birth' => $patient->date_of_birth?->toDateString(),
            ];
        }

        return $payload + [
            'total_debt' => (float) $patient->getAttribute('total_debt_uzs'),
            'total_paid' => (float) $patient->getAttribute('total_paid_uzs'),
            'balance' => (float) $patient->getAttribute('balance_uzs'),
            'balances_by_currency' => [
                'UZS' => [
                    'total_debt' => (float) $patient->getAttribute('total_debt_uzs'),
                    'total_paid' => (float) $patient->getAttribute('total_paid_uzs'),
                    'balance' => (float) $patient->getAttribute('balance_uzs'),
                ],
                'USD' => [
                    'total_debt' => (float) $patient->getAttribute('total_debt_usd'),
                    'total_paid' => (float) $patient->getAttribute('total_paid_usd'),
                    'balance' => (float) $patient->getAttribute('balance_usd'),
                ],
            ],
            'entry_count' => (int) $patient->getAttribute('entry_count'),
            'last_entry_date' => $patient->getAttribute('last_entry_date'),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function historyRow(Treatment $treatment): array
    {
        return [
            'id' => (string) $treatment->id,
            'patient_id' => (string) $treatment->patient_id,
            'patient_name' => $treatment->patient?->full_name,
            'patient_phone' => $treatment->patient?->phone,
            'patient_secondary_phone' => $treatment->patient?->secondary_phone,
            'patient_code' => $treatment->patient?->patient_id,
            'date' => $treatment->treatment_date?->toDateString(),
            'teeth' => $treatment->teeth ?? [],
            'work_done' => $treatment->treatment_type,
            'comment' => $treatment->comment,
            'debt' => (float) $treatment->debt_amount,
            'paid' => (float) $treatment->paid_amount,
            'balance_delta' => (float) $treatment->debt_amount - (float) $treatment->paid_amount,
            'currency' => $treatment->currency ?: Treatment::CURRENCY_UZS,
            'created_by' => $this->actorPayload($treatment->createdBy),
            'updated_by' => $this->actorPayload($treatment->updatedBy),
        ];
    }

    /**
     * @return array{id: string, name: string, role: string}|null
     */
    private function actorPayload(?User $actor): ?array
    {
        if ($actor === null) {
            return null;
        }

        return [
            'id' => (string) $actor->id,
            'name' => $actor->name,
            'role' => $actor->role,
        ];
    }
}
