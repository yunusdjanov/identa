<?php

namespace App\Services;

use App\Http\Requests\Team\ResetAssistantPasswordRequest;
use App\Http\Requests\Team\StoreAssistantRequest;
use App\Http\Requests\Team\UpdateAssistantRequest;
use App\Http\Requests\Team\UpdateAssistantStatusRequest;
use App\Models\User;
use App\Support\Search;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class TeamAssistantService
{
    private const DEFAULT_PER_PAGE = 15;

    private const MAX_PER_PAGE = 100;

    public function __construct(
        private readonly PlanLimitService $planLimitService,
    ) {}

    /**
     * @return array{assistants: LengthAwarePaginator, summary: array{total_count: int, active_count: int, blocked_count: int}}
     */
    public function list(Request $request): array
    {
        $dentistId = $this->dentistId($request);
        $summaryQuery = User::query()
            ->where('role', User::ROLE_ASSISTANT)
            ->where('dentist_owner_id', $dentistId);

        $query = User::query()
            ->where('role', User::ROLE_ASSISTANT)
            ->where('dentist_owner_id', $dentistId)
            ->orderByDesc('created_at');

        $search = $request->input('filter.search');
        if (is_string($search) && $search !== '') {
            // Postgres LIKE is case-sensitive; use the cross-DB helper.
            Search::ciLikeAny($query, ['name', 'email', 'phone'], $search);
        }

        $status = $request->input('filter.status');
        if (is_string($status) && $status !== '') {
            $query->where('account_status', $status);
            $summaryQuery->where('account_status', $status);
        }

        return [
            'assistants' => $query->paginate($this->perPage($request)),
            'summary' => [
                'total_count' => (clone $summaryQuery)->count(),
                'active_count' => (clone $summaryQuery)
                    ->where('account_status', User::ACCOUNT_STATUS_ACTIVE)
                    ->count(),
                'blocked_count' => (clone $summaryQuery)
                    ->where('account_status', User::ACCOUNT_STATUS_BLOCKED)
                    ->count(),
            ],
        ];
    }

    public function create(StoreAssistantRequest $request): User
    {
        $dentistId = $this->dentistId($request);
        $validated = $request->validated();
        $permissions = $this->sanitizePermissions(
            $validated['permissions'] ?? User::defaultAssistantPermissions()
        );

        return DB::transaction(function () use ($dentistId, $validated, $permissions): User {
            $dentist = $this->lockDentistForAssistantLimit($dentistId);
            $this->ensureAssistantSlotAvailable($dentist);

            return User::query()->create([
                'name' => trim((string) $validated['name']),
                'email' => trim((string) $validated['email']),
                'password' => Hash::make((string) $validated['password']),
                'phone' => $validated['phone'] ?? null,
                'role' => User::ROLE_ASSISTANT,
                'dentist_owner_id' => $dentistId,
                'assistant_permissions' => $permissions,
                'must_change_password' => true,
                'account_status' => User::ACCOUNT_STATUS_ACTIVE,
                // Staff accounts are created by a trusted dentist, so the email
                // is pre-verified — no self-verification banner for assistants.
                'email_verified_at' => now(),
                'practice_name' => null,
                'license_number' => null,
                'address' => null,
            ]);
        });
    }

    public function update(UpdateAssistantRequest $request, string $id): User
    {
        $assistant = $this->ownedAssistant($id, $this->dentistId($request), true);
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

        return $assistant->fresh();
    }

    public function updateStatus(UpdateAssistantStatusRequest $request, string $id): User
    {
        $dentistId = $this->dentistId($request);
        $status = (string) $request->validated('status');

        return DB::transaction(function () use ($dentistId, $id, $status): User {
            $dentist = $this->lockDentistForAssistantLimit($dentistId);
            $assistant = $this->ownedAssistant($id, $dentistId, true);

            if (
                $status === User::ACCOUNT_STATUS_ACTIVE
                && $assistant->account_status !== User::ACCOUNT_STATUS_ACTIVE
            ) {
                $this->ensureAssistantSlotAvailable($dentist);
            }

            $assistant->update([
                'account_status' => $status,
            ]);

            return $assistant->refresh();
        });
    }

    public function resetPassword(ResetAssistantPasswordRequest $request, string $id): User
    {
        $assistant = $this->ownedAssistant($id, $this->dentistId($request), false);

        $assistant->update([
            'password' => Hash::make((string) $request->validated('new_password')),
            'must_change_password' => true,
            'remember_token' => null,
        ]);

        return $assistant;
    }

    public function delete(Request $request, string $id): User
    {
        $assistant = $this->ownedAssistant($id, $this->dentistId($request), true);

        if ($assistant->account_status !== User::ACCOUNT_STATUS_DELETED) {
            $assistant->update([
                'account_status' => User::ACCOUNT_STATUS_DELETED,
                'remember_token' => null,
            ]);
        }

        return $assistant;
    }

    public function dentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }

    public function ownedAssistant(string $id, int $dentistId, bool $allowDeleted): User
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
    public function sanitizePermissions(?array $permissions): array
    {
        return User::normalizeAssistantPermissions($permissions);
    }

    private function perPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', self::DEFAULT_PER_PAGE);
        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        return min($perPage, self::MAX_PER_PAGE);
    }

    private function lockDentistForAssistantLimit(int $dentistId): User
    {
        return User::query()
            ->whereKey($dentistId)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function ensureAssistantSlotAvailable(User $dentist): void
    {
        $this->planLimitService->ensureStaffSlotAvailable($dentist);
    }
}
