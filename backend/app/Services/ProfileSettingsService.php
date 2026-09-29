<?php

namespace App\Services;

use App\Http\Requests\UpdateProfileRequest;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class ProfileSettingsService
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly SessionRevocationService $sessionRevocation,
    ) {}

    public function update(UpdateProfileRequest $request, User $user): User
    {
        $validated = $request->validated();
        $currentPassword = Arr::pull($validated, 'current_password');

        if ($user->isAdmin()) {
            $validated = Arr::only($validated, ['name', 'email']);
        }

        if ($user->isAssistant()) {
            $validated = Arr::only($validated, ['name', 'email', 'phone', 'show_record_authors']);
        }

        $userId = $user->id;
        $currentToken = $user->currentAccessToken();
        $currentTokenId = $currentToken !== null && method_exists($currentToken, 'getKey')
            ? $currentToken->getKey()
            : null;
        $currentSessionId = $request->hasSession()
            ? $request->session()->getId()
            : null;

        /** @var array{user: User, email_changed: bool} $result */
        $result = DB::transaction(function () use (
            $currentPassword,
            $currentSessionId,
            $currentTokenId,
            $request,
            $userId,
            $validated,
        ): array {
            $locked = User::query()->where('id', $userId)->lockForUpdate()->firstOrFail();

            $updatesWorkingHours = array_key_exists('working_hours_start', $validated)
                || array_key_exists('working_hours_end', $validated);
            if ($updatesWorkingHours) {
                $start = array_key_exists('working_hours_start', $validated)
                    ? $validated['working_hours_start']
                    : $this->normalizedTime($locked->working_hours_start);
                $end = array_key_exists('working_hours_end', $validated)
                    ? $validated['working_hours_end']
                    : $this->normalizedTime($locked->working_hours_end);

                if (($start === null) !== ($end === null)) {
                    throw ValidationException::withMessages([
                        'working_hours_end' => [__('api.settings.working_hours_pair_required')],
                    ]);
                }

                if ($start !== null && $end !== null && $end <= $start) {
                    throw ValidationException::withMessages([
                        'working_hours_end' => [__('api.settings.working_hours_end_after_start')],
                    ]);
                }
            }

            $emailChanged = array_key_exists('email', $validated)
                && (string) $locked->email !== (string) $validated['email'];

            if ($emailChanged) {
                if ($locked->password === null) {
                    throw ValidationException::withMessages([
                        'email' => [__('api.settings.email_change_requires_password')],
                    ]);
                }

                if (! is_string($currentPassword) || ! Hash::check($currentPassword, (string) $locked->password)) {
                    throw ValidationException::withMessages([
                        'current_password' => [__('api.auth.current_password_incorrect')],
                    ]);
                }
            }

            $changedKeys = [];
            foreach ($validated as $key => $value) {
                if ($this->normalizedComparableValue($key, $locked->getAttribute($key))
                    !== $this->normalizedComparableValue($key, $value)
                ) {
                    $changedKeys[] = $key;
                }
            }

            if ($changedKeys === []) {
                return [
                    'user' => $locked->fresh(),
                    'email_changed' => false,
                ];
            }

            $locked->fill(Arr::only($validated, $changedKeys));

            if ($emailChanged) {
                // An email update is an identity transfer, not a cosmetic
                // profile edit. Require the current password above, remove a
                // Google identity that was verified against the old address,
                // reset verification, and invalidate reusable credentials on
                // every other device while keeping this confirmed session.
                $locked->forceFill([
                    'email_verified_at' => null,
                    'google_id' => null,
                    'provider' => 'email',
                    'remember_token' => null,
                ]);
            }

            $locked->save();

            if ($emailChanged) {
                $locked->tokens()
                    ->when($currentTokenId !== null, fn ($query) => $query->where('id', '!=', $currentTokenId))
                    ->delete();
                $this->sessionRevocation->revokeForUsers([$locked], $currentSessionId);
            }

            // The audit trail records which settings changed without keeping
            // old/new email, phone, address, or licence values indefinitely.
            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'settings.profile.updated',
                entityType: 'user',
                entityId: (string) $locked->id,
                metadata: [
                    'role' => $locked->role,
                    'changed_fields' => $changedKeys,
                ],
            );

            return [
                'user' => $locked->fresh(),
                'email_changed' => $emailChanged,
            ];
        });

        if ($result['email_changed'] && $request->hasSession()) {
            $request->session()->regenerate();
            $request->session()->regenerateToken();
        }

        return $result['user'];
    }

    private function normalizedComparableValue(string $key, mixed $value): mixed
    {
        return match ($key) {
            'working_hours_start', 'working_hours_end' => $this->normalizedTime($value),
            'default_appointment_duration' => $value === null ? null : (int) $value,
            'show_record_authors' => (bool) $value,
            default => $value,
        };
    }

    private function normalizedTime(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        return substr($value, 0, 5);
    }
}
