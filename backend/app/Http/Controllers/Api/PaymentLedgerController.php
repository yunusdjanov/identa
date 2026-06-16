<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use App\Services\PaymentLedgerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentLedgerController extends Controller
{
    public function __construct(
        private readonly PaymentLedgerService $ledger,
    ) {}

    /**
     * GET /api/v1/payments/ledger/patients
     *
     * Auth: payments.view. Query: page, per_page, filter[patient_id],
     * filter[search], filter[outstanding]. Returns patient-level balances
     * plus summary totals for the payments page.
     */
    public function patients(Request $request): JsonResponse
    {
        $result = $this->ledger->listPatientBalances($request);
        $rows = $result['rows'];

        return response()->json([
            'data' => $rows
                ->getCollection()
                ->map(fn (Patient $patient): array => $this->patientRow($patient))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $rows->currentPage(),
                    'per_page' => $rows->perPage(),
                    'total' => $rows->total(),
                    'total_pages' => $rows->lastPage(),
                ],
                'summary' => $result['summary'],
            ],
        ]);
    }

    /**
     * GET /api/v1/payments/ledger/history
     *
     * Auth: payments.view. Query: page, per_page, filter[patient_id],
     * filter[search], filter[outstanding]. Returns treatment-ledger rows
     * for the payments history table.
     */
    public function history(Request $request): JsonResponse
    {
        $result = $this->ledger->listHistoryRows($request);
        $rows = $result['rows'];

        return response()->json([
            'data' => $rows
                ->getCollection()
                ->map(fn (Treatment $treatment): array => $this->historyRow($treatment))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $rows->currentPage(),
                    'per_page' => $rows->perPage(),
                    'total' => $rows->total(),
                    'total_pages' => $rows->lastPage(),
                ],
                'summary' => $result['summary'],
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function patientRow(Patient $patient): array
    {
        return [
            'patient_id' => (string) $patient->id,
            'patient_code' => $patient->getAttribute('patient_code'),
            'patient_name' => $patient->full_name,
            'patient_phone' => $patient->phone,
            'patient_secondary_phone' => $patient->secondary_phone,
            'total_debt' => (float) $patient->getAttribute('total_debt'),
            'total_paid' => (float) $patient->getAttribute('total_paid'),
            'balance' => (float) $patient->getAttribute('balance'),
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
