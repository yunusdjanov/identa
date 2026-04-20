<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreLeadRequest;
use App\Models\LandingSetting;
use App\Models\LeadRequest;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LandingController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {
    }

    public function showSettings(): JsonResponse
    {
        return response()->json([
            'data' => $this->transformSettings(LandingSetting::current()),
        ]);
    }

    public function storeLeadRequest(StoreLeadRequest $request): JsonResponse
    {
        $leadRequest = LeadRequest::query()->create($request->validated());

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'landing.lead_request_created',
            entityType: 'lead_request',
            entityId: (string) $leadRequest->id,
            metadata: [
                'clinic_name' => $leadRequest->clinic_name,
                'city' => $leadRequest->city,
            ],
        );

        return response()->json([
            'data' => $this->transformLeadRequest($leadRequest),
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    protected function transformSettings(LandingSetting $settings): array
    {
        return [
            'trial_price_amount' => (int) $settings->trial_price_amount,
            'monthly_price_amount' => (int) $settings->monthly_price_amount,
            'yearly_price_amount' => (int) $settings->yearly_price_amount,
            'currency' => $settings->currency,
            'telegram_contact_url' => $settings->telegram_contact_url,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function transformLeadRequest(LeadRequest $leadRequest): array
    {
        return [
            'id' => (string) $leadRequest->id,
            'name' => $leadRequest->name,
            'phone' => $leadRequest->phone,
            'clinic_name' => $leadRequest->clinic_name,
            'city' => $leadRequest->city,
            'note' => $leadRequest->note,
            'status' => $leadRequest->status,
            'handled_at' => $leadRequest->handled_at?->toIso8601String(),
            'created_at' => $leadRequest->created_at?->toIso8601String(),
        ];
    }
}
