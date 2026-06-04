<?php

namespace App\Services;

use App\Http\Requests\UpdateProfileRequest;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ProfileSettingsService
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {}

    public function update(UpdateProfileRequest $request, User $user): User
    {
        $validated = $request->validated();

        if ($user->isAdmin()) {
            $validated = Arr::only($validated, ['name', 'email']);
        }

        if ($user->isAssistant()) {
            $validated = Arr::only($validated, ['name', 'email', 'phone']);
        }

        $start = $validated['working_hours_start'] ?? null;
        $end = $validated['working_hours_end'] ?? null;

        if ($start !== null && $end !== null && $end <= $start) {
            throw ValidationException::withMessages([
                'working_hours_end' => [__('api.settings.working_hours_end_after_start')],
            ]);
        }

        // Snapshot tracked fields before the write so the audit log captures
        // the actual delta — useful for security review of admin email
        // changes and assistant phone changes.
        $trackedKeys = array_keys($validated);
        $userId = $user->id;

        // Lock the user row inside the transaction so two concurrent edits
        // (e.g. user open in two tabs) serialise. Without the lock the
        // before/after snapshot can capture interleaved writes and the
        // audit log lies about the delta. Also: if the assistant changes
        // their `email` here, the verified flag must reset — see
        // `email_verified_at` handling below.
        $before = [];
        DB::transaction(function () use ($userId, $trackedKeys, $validated, &$before, &$user): void {
            $locked = User::query()->where('id', $userId)->lockForUpdate()->firstOrFail();
            $before = $locked->only($trackedKeys);

            // Email change resets verified state — the user has to re-prove
            // ownership of the new address. Without this an attacker who
            // grabs the session of an unverified-flag-clearing account can
            // transfer the verified tick to an unowned address; later
            // password-reset and notification emails go there.
            if (array_key_exists('email', $validated)
                && (string) ($before['email'] ?? '') !== (string) $validated['email']
            ) {
                $locked->email_verified_at = null;
            }

            $locked->update($validated);
            $user = $locked->fresh();
        });

        $changedKeys = array_keys(array_filter(
            $validated,
            fn ($value, string $key) => ($before[$key] ?? null) !== $value,
            ARRAY_FILTER_USE_BOTH,
        ));

        if ($changedKeys !== []) {
            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'settings.profile.updated',
                entityType: 'user',
                entityId: (string) $user->id,
                metadata: [
                    'role' => $user->role,
                    'changed_fields' => $changedKeys,
                    'before' => Arr::only($before, $changedKeys),
                    'after' => Arr::only($user->only($trackedKeys), $changedKeys),
                ],
            );
        }

        return $user;
    }
}
