<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Api\LandingController;
use App\Http\Requests\Admin\UpdateLandingSettingsRequest;
use App\Http\Requests\Admin\UpdateLeadRequestStatusRequest;
use App\Models\LandingSetting;
use App\Models\LeadRequest;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LandingSettingsController extends LandingController
{
    public function __construct(
        AuditLogger $auditLogger,
    ) {
        parent::__construct($auditLogger);
    }

    public function show(): JsonResponse
    {
        return response()->json([
            'data' => $this->transformSettings(LandingSetting::current()),
        ]);
    }

    public function update(UpdateLandingSettingsRequest $request): JsonResponse
    {
        $settings = LandingSetting::current();
        $validated = $request->validated();

        $settings->update([
            'trial_price_amount' => (int) $validated['trial_price_amount'],
            'monthly_price_amount' => (int) $validated['monthly_price_amount'],
            'yearly_price_amount' => (int) $validated['yearly_price_amount'],
            'telegram_contact_url' => isset($validated['telegram_contact_url'])
                ? trim((string) $validated['telegram_contact_url']) ?: null
                : null,
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'admin.landing_settings.updated',
            entityType: 'landing_setting',
            entityId: (string) $settings->id,
            metadata: [
                'trial_price_amount' => $settings->trial_price_amount,
                'monthly_price_amount' => $settings->monthly_price_amount,
                'yearly_price_amount' => $settings->yearly_price_amount,
            ],
        );

        return response()->json([
            'data' => $this->transformSettings($settings->fresh()),
        ]);
    }

    public function leadRequests(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('per_page', 20), 1), 100);
        $leadRequests = LeadRequest::query()
            ->latest('created_at')
            ->paginate($perPage);

        return response()->json([
            'data' => collect($leadRequests->items())
                ->map(fn (LeadRequest $leadRequest): array => $this->transformLeadRequest($leadRequest))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $leadRequests->currentPage(),
                    'per_page' => $leadRequests->perPage(),
                    'total' => $leadRequests->total(),
                    'total_pages' => $leadRequests->lastPage(),
                ],
            ],
        ]);
    }

    public function updateLeadRequestStatus(UpdateLeadRequestStatusRequest $request, string $id): JsonResponse
    {
        $leadRequest = LeadRequest::query()->findOrFail($id);
        $status = (string) $request->validated('status');
        /** @var \App\Models\User $admin */
        $admin = $request->user();

        $leadRequest->update([
            'status' => $status,
            'handled_by_admin_id' => $status === LeadRequest::STATUS_NEW ? null : $admin->id,
            'handled_at' => $status === LeadRequest::STATUS_NEW ? null : now(),
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'admin.lead_request.status_updated',
            entityType: 'lead_request',
            entityId: (string) $leadRequest->id,
            metadata: [
                'status' => $status,
            ],
        );

        return response()->json([
            'data' => $this->transformLeadRequest($leadRequest->fresh()),
        ]);
    }
}
