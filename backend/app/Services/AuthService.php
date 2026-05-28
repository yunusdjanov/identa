<?php

namespace App\Services;

use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class AuthService
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly SubscriptionService $subscriptionService,
        private readonly GoogleIdentityService $googleIdentityService,
    ) {}

    /**
     * @param  array<string, mixed>  $validated
     */
    public function register(Request $request, array $validated): User
    {
        $user = DB::transaction(function () use ($validated): User {
            $user = User::query()->create([
                'name' => trim((string) $validated['name']),
                'email' => trim((string) $validated['email']),
                'password' => Hash::make((string) $validated['password']),
                'provider' => 'email',
                'role' => User::ROLE_DENTIST,
                'account_status' => User::ACCOUNT_STATUS_ACTIVE,
                'must_change_password' => false,
                'working_hours_start' => '09:00',
                'working_hours_end' => '20:00',
                'default_appointment_duration' => 30,
            ]);

            $this->subscriptionService->startTrial($user, 'Public self-service registration');

            return $user->fresh();
        });

        $this->loginUser($request, $user, true);

        // Best-effort: send the email-verification link. Registration must
        // still succeed even if the mailer is down/unconfigured, so failures
        // are logged rather than thrown. The user is auto-logged-in (soft
        // gate) and nudged to verify via the in-app banner + resend.
        try {
            $user->sendEmailVerificationNotification();
        } catch (\Throwable $exception) {
            Log::warning('Failed to send verification email on registration', [
                'user_id' => $user->id,
                'error' => $exception->getMessage(),
            ]);
        }

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'auth.register',
            entityType: 'user',
            entityId: (string) $user->id,
            metadata: [
                'provider' => 'email',
            ],
        );

        return $user->refresh();
    }

    public function google(Request $request, string $idToken): User
    {
        $googleUser = $this->googleIdentityService->verifyIdToken($idToken);

        $user = DB::transaction(function () use ($googleUser): User {
            /** @var User|null $user */
            $user = User::query()
                ->where('google_id', $googleUser['sub'])
                ->orWhere('email', $googleUser['email'])
                ->lockForUpdate()
                ->first();

            if ($user === null) {
                $user = User::query()->create([
                    'name' => $googleUser['name'] ?: $googleUser['email'],
                    'email' => $googleUser['email'],
                    'password' => null,
                    'provider' => 'google',
                    'google_id' => $googleUser['sub'],
                    'avatar_url' => $googleUser['picture'] ?? null,
                    'email_verified_at' => now(),
                    'role' => User::ROLE_DENTIST,
                    'account_status' => User::ACCOUNT_STATUS_ACTIVE,
                    'must_change_password' => false,
                    'working_hours_start' => '09:00',
                    'working_hours_end' => '20:00',
                    'default_appointment_duration' => 30,
                ]);
                $this->subscriptionService->startTrial($user, 'Google self-service registration');

                return $user->fresh();
            }

            if ($user->isAdmin()) {
                throw ValidationException::withMessages([
                    'email' => [__('api.auth.invalid_credentials')],
                ]);
            }

            $user->forceFill([
                'provider' => $user->provider === 'email' ? 'email' : 'google',
                'google_id' => $user->google_id ?? $googleUser['sub'],
                'avatar_url' => $googleUser['picture'] ?? $user->avatar_url,
                'email_verified_at' => $user->email_verified_at ?? now(),
            ])->save();

            if ($user->isDentist()) {
                $this->subscriptionService->ensureTrial($user, 'Google account linked');
            }

            return $user->fresh();
        });

        $this->ensureUserCanLogin($user);
        $this->loginUser($request, $user, true);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'auth.google',
            entityType: 'user',
            entityId: (string) $user->id,
            metadata: [
                'provider' => 'google',
            ],
        );

        return $user->refresh();
    }

    /**
     * @param  array<string, mixed>  $credentials
     */
    public function login(Request $request, array $credentials): User
    {
        $remember = (bool) ($credentials['remember'] ?? false);
        $portal = (string) ($credentials['portal'] ?? 'app');
        unset($credentials['remember']);
        unset($credentials['portal']);

        if (! Auth::guard('web')->attempt($credentials, $remember)) {
            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'auth.login_failed',
                metadata: [
                    'email' => $credentials['email'],
                ],
            );

            throw ValidationException::withMessages([
                'email' => [__('api.auth.invalid_credentials')],
            ]);
        }

        $request->session()->regenerate();

        /** @var User $user */
        $user = Auth::guard('web')->user();

        if ($this->isLoginPortalMismatch($user, $portal)) {
            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'auth.login_portal_rejected',
                entityType: 'user',
                entityId: (string) $user->id,
                metadata: [
                    'portal' => $portal,
                    'role' => $user->role,
                ],
            );

            $this->logoutCurrentSession($request);

            throw ValidationException::withMessages([
                'email' => [__('api.auth.invalid_credentials')],
            ]);
        }

        if (! $user->hasActiveAccount()) {
            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'auth.login_blocked',
                entityType: 'user',
                entityId: (string) $user->id,
                metadata: [
                    'account_status' => $user->account_status,
                ],
            );

            $this->logoutCurrentSession($request);

            throw ValidationException::withMessages([
                'email' => [__('api.auth.account_inactive')],
            ]);
        }

        if ($user->isAssistant()) {
            $ownerDentist = $user->ownerDentist;
            if ($ownerDentist === null || ! $ownerDentist->hasActiveAccount()) {
                $this->auditLogger->logFromRequest(
                    request: $request,
                    eventType: 'auth.login_blocked',
                    entityType: 'user',
                    entityId: (string) $user->id,
                    metadata: [
                        'reason' => 'assistant_owner_inactive',
                        'owner_id' => $user->dentist_owner_id,
                    ],
                );

                $this->logoutCurrentSession($request);

                throw ValidationException::withMessages([
                    'email' => [__('api.auth.account_inactive')],
                ]);
            }
        }

        $user->update(['last_login_at' => now()]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'auth.login',
            entityType: 'user',
            entityId: (string) $user->id,
            metadata: [
                'remember' => $remember,
            ],
        );

        return $user;
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    public function changePassword(Request $request, User $user, array $validated, bool $requiresCurrentPassword): User
    {
        if (
            $requiresCurrentPassword
            && ! Hash::check((string) $validated['current_password'], (string) $user->password)
        ) {
            throw ValidationException::withMessages([
                'current_password' => [__('api.auth.current_password_incorrect')],
            ]);
        }

        $user->update([
            'password' => Hash::make((string) $validated['new_password']),
            'must_change_password' => false,
            'remember_token' => null,
        ]);
        $user->refresh();

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'auth.password_changed',
            entityType: 'user',
            entityId: (string) $user->id,
        );

        return $user;
    }

    private function loginUser(Request $request, User $user, bool $remember): void
    {
        Auth::guard('web')->login($user, $remember);
        $request->session()->regenerate();
        $user->update(['last_login_at' => now()]);
    }

    private function ensureUserCanLogin(User $user): void
    {
        if (! $user->hasActiveAccount()) {
            throw ValidationException::withMessages([
                'email' => [__('api.auth.account_inactive')],
            ]);
        }

        if ($user->isAssistant()) {
            $ownerDentist = $user->ownerDentist;
            if ($ownerDentist === null || ! $ownerDentist->hasActiveAccount()) {
                throw ValidationException::withMessages([
                    'email' => [__('api.auth.account_inactive')],
                ]);
            }
        }
    }

    private function isLoginPortalMismatch(User $user, string $portal): bool
    {
        return match ($portal) {
            'admin' => ! $user->isAdmin(),
            default => $user->isAdmin(),
        };
    }

    private function logoutCurrentSession(Request $request): void
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
    }
}
