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
        private readonly AccountAccessRevocationService $accessRevocation,
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
        $dentistId = $this->dentistId($request);
        $validated = $request->validated();

        // Lock the assistant row so two concurrent admin edits (or admin
        // rename + assistant self-edit when those paths share a model)
        // serialise. Otherwise the permissions snapshot can stale.
        return DB::transaction(function () use ($id, $dentistId, $validated): User {
            $assistant = $this->ownedAssistant($id, $dentistId, false, true);

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
        });
    }

    public function updateStatus(UpdateAssistantStatusRequest $request, string $id): User
    {
        $dentistId = $this->dentistId($request);
        $status = (string) $request->validated('status');

        return DB::transaction(function () use ($dentistId, $id, $status): User {
            $dentist = $this->lockDentistForAssistantLimit($dentistId);
            $assistant = $this->ownedAssistant($id, $dentistId, false, true);

            if (
                $status === User::ACCOUNT_STATUS_ACTIVE
                && $assistant->account_status !== User::ACCOUNT_STATUS_ACTIVE
            ) {
                $this->ensureAssistantSlotAvailable($dentist);
            }

            $assistant->update([
                'account_status' => $status,
            ]);

            if ($status === User::ACCOUNT_STATUS_BLOCKED) {
                $this->accessRevocation->revokeForUsers([$assistant]);
            }

            return $assistant->refresh();
        });
    }

    public function resetPassword(ResetAssistantPasswordRequest $request, string $id): User
    {
        $dentistId = $this->dentistId($request);
        $newPassword = (string) $request->validated('new_password');

        return DB::transaction(function () use ($id, $dentistId, $newPassword): User {
            $assistant = $this->ownedAssistant($id, $dentistId, false, true);

            $assistant->update([
                'password' => Hash::make($newPassword),
                'must_change_password' => true,
                'remember_token' => null,
            ]);

            // Kill any active Sanctum tokens so the assistant's existing app
            // sessions are forced to re-authenticate with the new password.
            // Without this, a stolen/active token outlives the reset.
            $this->accessRevocation->revokeForUsers([$assistant]);

            return $assistant;
        });
    }

    public function delete(Request $request, string $id): User
    {
        $dentistId = $this->dentistId($request);

        // Wrap in transaction + lock so two concurrent delete clicks (or
        // delete + status update racing) can't both pass the
        // ACCOUNT_STATUS_DELETED check below — the loser would otherwise
        // overwrite the email rotation done by the winner and re-expose
        // the original address.
        return DB::transaction(function () use ($id, $dentistId, $request): User {
            $assistant = $this->ownedAssistant($id, $dentistId, true, true);

            return $this->performDelete($assistant);
        });
    }

    private function performDelete(User $assistant): User
    {
        if ($assistant->account_status !== User::ACCOUNT_STATUS_DELETED) {
            // Null out the email + phone on delete so the dentist can
            // re-invite the same person (or a different person at the
            // same address) without hitting the hard UNIQUE constraint
            // on users.email. The original values are preserved via the
            // controller-level audit log (which reads them BEFORE
            // calling this service) and the `deleted-{id}@deleted.invalid`
            // suffix remains scannable for support / forensic recovery.
            // FA-X2: previously a soft-deleted assistant blocked re-
            // invite forever because StoreAssistantRequest's
            // Rule::unique('users','email') checks every row.
            $assistant->update([
                'account_status' => User::ACCOUNT_STATUS_DELETED,
                'remember_token' => null,
                'email' => sprintf('deleted-%s@deleted.invalid', $assistant->id),
                'phone' => null,
            ]);
            // Revoke Sanctum tokens — the email rotation makes future
            // /auth/me fail for stale clients, but tokens-in-flight
            // would still pass `auth:sanctum` until the next request.
            $this->accessRevocation->revokeForUsers([$assistant]);
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

    public function ownedAssistant(string $id, int $dentistId, bool $allowDeleted, bool $lockForUpdate = false): User
    {
        $query = User::query()
            ->where('id', $id)
            ->where('role', User::ROLE_ASSISTANT)
            ->where('dentist_owner_id', $dentistId);

        if ($lockForUpdate) {
            $query->lockForUpdate();
        }

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
