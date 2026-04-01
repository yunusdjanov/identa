<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Team\ResetAssistantPasswordRequest;
use App\Http\Requests\Team\StoreAssistantRequest;
use App\Http\Requests\Team\UpdateAssistantRequest;
use App\Http\Requests\Team\UpdateAssistantStatusRequest;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class TeamAssistantController extends Controller
{
    private const DEFAULT_PER_PAGE = 15;
    private const MAX_PER_PAGE = 100;

    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);
        $perPage = $this->resolvePerPage($request);
        $summaryQuery = User::query()
            ->where('role', User::ROLE_ASSISTANT)
            ->where('dentist_owner_id', $dentistId);

        $query = User::query()
            ->where('role', User::ROLE_ASSISTANT)
            ->where('dentist_owner_id', $dentistId)
            ->orderByDesc('created_at');

        $search = $request->input('filter.search');
        if (is_string($search) && $search !== '') {
            $query->where(function (Builder $builder) use ($search): void {
                $builder
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        $status = $request->input('filter.status');
        if (is_string($status) && $status !== '') {
            $query->where('account_status', $status);
            $summaryQuery->where('account_status', $status);
        }

        $assistants = $query->paginate($perPage);
        $totalCount = (clone $summaryQuery)->count();
        $activeCount = (clone $summaryQuery)
            ->where('account_status', User::ACCOUNT_STATUS_ACTIVE)
            ->count();
        $blockedCount = (clone $summaryQuery)
            ->where('account_status', User::ACCOUNT_STATUS_BLOCKED)
            ->count();

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
                'summary' => [
                    'total_count' => $totalCount,
                    'active_count' => $activeCount,
                    'blocked_count' => $blockedCount,
                ],
            ],
        ]);
    }

    public function store(StoreAssistantRequest $request): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);
        $validated = $request->validated();
        $permissions = $this->sanitizePermissions(
            $validated['permissions'] ?? User::defaultAssistantPermissions()
        );

        $assistant = User::query()->create([
            'name' => trim((string) $validated['name']),
            'email' => trim((string) $validated['email']),
            'password' => Hash::make((string) $validated['password']),
            'phone' => $validated['phone'] ?? null,
            'role' => User::ROLE_ASSISTANT,
            'dentist_owner_id' => $dentistId,
            'assistant_permissions' => $permissions,
            'must_change_password' => true,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
            'practice_name' => null,
            'license_number' => null,
            'address' => null,
        ]);

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
        $dentistId = $this->resolveDentistId($request);
        $assistant = $this->findOwnedAssistant($id, $dentistId, true);
        $validated = $request->validated();

        $permissions = $assistant->assistant_permissions ?? [];
        if (array_key_exists('permissions', $validated)) {
            $permissions = $this->sanitizePermissions($validated['permissions'] ?? []);
        }

        $assistant->update([
            'name' => trim((string) $validated['name']),
            'email' => trim((string) $validated['email']),
            'phone' => $validated['phone'] ?? null,
            'assistant_permissions' => $permissions,
        ]);

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
            'data' => $this->transformAssistant($assistant->fresh()),
        ]);
    }

    public function updateStatus(UpdateAssistantStatusRequest $request, string $id): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);
        $assistant = $this->findOwnedAssistant($id, $dentistId, true);
        $status = (string) $request->validated('status');

        $assistant->update([
            'account_status' => $status,
        ]);

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
            'data' => $this->transformAssistant($assistant->fresh()),
        ]);
    }

    public function resetPassword(ResetAssistantPasswordRequest $request, string $id): JsonResponse
    {
        $dentistId = $this->resolveDentistId($request);
        $assistant = $this->findOwnedAssistant($id, $dentistId, false);

        $assistant->update([
            'password' => Hash::make((string) $request->validated('new_password')),
            'must_change_password' => true,
            'remember_token' => null,
        ]);

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
        $dentistId = $this->resolveDentistId($request);
        $assistant = $this->findOwnedAssistant($id, $dentistId, true);

        if ($assistant->account_status === User::ACCOUNT_STATUS_DELETED) {
            return response()->json([], 204);
        }

        $assistant->update([
            'account_status' => User::ACCOUNT_STATUS_DELETED,
            'remember_token' => null,
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'team.assistant.deleted',
            entityType: 'user',
            entityId: (string) $assistant->id,
        );

        return response()->json([], 204);
    }

    private function resolveDentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }

    private function resolvePerPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        return min($perPage, self::MAX_PER_PAGE);
    }

    private function findOwnedAssistant(string $id, int $dentistId, bool $allowDeleted): User
    {
        $query = User::query()
            ->where('id', $id)
            ->where('role', User::ROLE_ASSISTANT)
            ->where('dentist_owner_id', $dentistId);

        if (! $allowDeleted) {
            $query->where('account_status', '!=', User::ACCOUNT_STATUS_DELETED);
        }

        return $query->firstOrFail();
    }

    /**
     * @param  list<string>|null  $permissions
     * @return list<string>
     */
    private function sanitizePermissions(?array $permissions): array
    {
        if ($permissions === null) {
            return [];
        }
        $allowedPermissions = $this->allowedAssistantPermissions();

        return array_values(array_unique(array_filter(
            $permissions,
            static fn (mixed $permission): bool => is_string($permission)
                && in_array($permission, $allowedPermissions, true)
        )));
    }

    /**
     * @return list<string>
     */
    private function allowedAssistantPermissions(): array
    {
        return [
            User::PERMISSION_PATIENTS_VIEW,
            User::PERMISSION_PATIENTS_MANAGE,
            User::PERMISSION_APPOINTMENTS_VIEW,
            User::PERMISSION_APPOINTMENTS_MANAGE,
            User::PERMISSION_INVOICES_VIEW,
            User::PERMISSION_INVOICES_MANAGE,
            User::PERMISSION_PAYMENTS_VIEW,
            User::PERMISSION_PAYMENTS_MANAGE,
            User::PERMISSION_ODONTOGRAM_VIEW,
            User::PERMISSION_ODONTOGRAM_MANAGE,
            User::PERMISSION_TREATMENTS_VIEW,
            User::PERMISSION_TREATMENTS_MANAGE,
            User::PERMISSION_PATIENT_CATEGORIES_VIEW,
            User::PERMISSION_PATIENT_CATEGORIES_MANAGE,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function transformAssistant(User $assistant): array
    {
        return [
            'id' => (string) $assistant->id,
            'name' => $assistant->name,
            'email' => $assistant->email,
            'phone' => $assistant->phone,
            'account_status' => $assistant->account_status,
            'assistant_permissions' => $assistant->assistant_permissions ?? [],
            'must_change_password' => (bool) $assistant->must_change_password,
            'last_login_at' => $assistant->last_login_at?->toIso8601String(),
            'created_at' => $assistant->created_at?->toIso8601String(),
        ];
    }
}
