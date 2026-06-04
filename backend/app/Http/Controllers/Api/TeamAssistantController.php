<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Team\ResetAssistantPasswordRequest;
use App\Http\Requests\Team\StoreAssistantRequest;
use App\Http\Requests\Team\UpdateAssistantRequest;
use App\Http\Requests\Team\UpdateAssistantStatusRequest;
use App\Http\Resources\AssistantResource;
use App\Models\User;
use App\Services\TeamAssistantService;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TeamAssistantController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly TeamAssistantService $team,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $result = $this->team->list($request);
        $assistants = $result['assistants'];

        return response()->json([
            'data' => collect($assistants->items())
                ->map(fn (User $assistant): array => $this->transformAssistant($assistant))
                ->values()
                ->all(),
            'meta' => [
                'pagination' => [
                    'page' => $assistants->currentPage(),
                    'per_page' => $assistants->perPage(),
                    'total' => $assistants->total(),
                    'total_pages' => $assistants->lastPage(),
                ],
                'summary' => $result['summary'],
            ],
        ]);
    }

    public function store(StoreAssistantRequest $request): JsonResponse
    {
        $assistant = $this->team->create($request);
        $permissions = $this->team->sanitizePermissions(
            $request->validated('permissions') ?? User::defaultAssistantPermissions()
        );

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'team.assistant.created',
            entityType: 'user',
            entityId: (string) $assistant->id,
            metadata: [
                'assistant_email' => $assistant->email,
                'permission_count' => count($permissions),
            ],
        );

        return response()->json([
            'data' => $this->transformAssistant($assistant),
        ], 201);
    }

    public function update(UpdateAssistantRequest $request, string $id): JsonResponse
    {
        $assistant = $this->team->update($request, $id);
        $permissions = $assistant->assistant_permissions ?? [];

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'team.assistant.updated',
            entityType: 'user',
            entityId: (string) $assistant->id,
            metadata: [
                'permission_count' => is_array($permissions) ? count($permissions) : 0,
            ],
        );

        return response()->json([
            'data' => $this->transformAssistant($assistant),
        ]);
    }

    public function updateStatus(UpdateAssistantStatusRequest $request, string $id): JsonResponse
    {
        $assistant = $this->team->updateStatus($request, $id);
        $status = (string) $request->validated('status');

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'team.assistant.status_updated',
            entityType: 'user',
            entityId: (string) $assistant->id,
            metadata: [
                'status' => $status,
            ],
        );

        return response()->json([
            'data' => $this->transformAssistant($assistant),
        ]);
    }

    public function resetPassword(ResetAssistantPasswordRequest $request, string $id): JsonResponse
    {
        $assistant = $this->team->resetPassword($request, $id);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'team.assistant.password_reset',
            entityType: 'user',
            entityId: (string) $assistant->id,
        );

        return response()->json([
            'data' => [
                'assistant_id' => (string) $assistant->id,
                'password_reset' => true,
            ],
        ]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        // Capture original PII BEFORE the service rotates email/phone
        // so the audit log records who was actually removed (the
        // service overwrites `email` with a synthetic deleted-{id}@
        // value to free the UNIQUE constraint for re-invites).
        $assistantBeforeDelete = $this->team->ownedAssistant(
            $id,
            $this->team->dentistId($request),
            true
        );
        $originalEmail = $assistantBeforeDelete->email;
        $originalPhone = $assistantBeforeDelete->phone;

        $assistant = $this->team->delete($request, $id);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'team.assistant.deleted',
            entityType: 'user',
            entityId: (string) $assistant->id,
            metadata: [
                'original_email' => $originalEmail,
                'original_phone' => $originalPhone,
            ],
        );

        return response()->json([], 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformAssistant(User $assistant): array
    {
        return (new AssistantResource($assistant))->resolve(request());
    }
}
