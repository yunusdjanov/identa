<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreLeadRequest;
use App\Http\Resources\LandingSettingsResource;
use App\Http\Resources\LeadRequestResource;
use App\Models\LeadRequest;
use App\Services\LandingService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;

class LandingController extends Controller
{
    public function __construct(
        protected readonly AuditLogger $auditLogger,
        private readonly LandingService $landing,
    ) {}

    public function showSettings(): JsonResponse
    {
        $payload = $this->landing->settingsPayload();

        return response()->json([
            'data' => (new LandingSettingsResource($payload['settings'], $payload['plans']))->resolve(request()),
        ]);
    }

    public function storeLeadRequest(StoreLeadRequest $request): JsonResponse
    {
        $leadRequest = $this->landing->createLead($request->validated());

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
    private function transformLeadRequest(LeadRequest $leadRequest): array
    {
        return (new LeadRequestResource($leadRequest))->resolve(request());
    }
}
