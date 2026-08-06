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
        private readonly SessionRevocationService $sessionRevocation,
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
                'exception' => $exception::class,
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

            // Strict linking policy: silently binding a Google identity to
            // an existing email-only account is an account-takeover vector.
            // (Compromise the Gmail → click "Sign in with Google" → inherit
            // the victim's clinic.) The public /auth/google endpoint only
            // accepts logins where `google_id` already matches the incoming
            // Google subject — first-time linking has to go through the
            // authenticated Settings → Connected Accounts flow, which proves
            // the user owns the Identa account before binding Google. Same
            // policy as Stripe / GitHub / Vercel.
            if ($user->google_id !== $googleUser['sub']) {
                throw ValidationException::withMessages([
                    'email' => [__('api.auth.google_link_required')],
                ]);
            }

            // Returning Google user — refresh the soft metadata Google may
            // have changed (avatar, verification timestamp) without touching
            // the identity columns (provider, google_id, email).
            $user->forceFill([
                'avatar_url' => $googleUser['picture'] ?? $user->avatar_url,
                'email_verified_at' => $user->email_verified_at ?? now(),
            ])->save();

            if ($user->isDentist()) {
                $this->subscriptionService->ensureTrial($user, 'Google login');
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
     * Link a verified Google identity to the currently-authenticated user.
     *
     * This is the safe counterpart to the public /auth/google endpoint
     * (which now hard-rejects unknown linkages, per the security policy).
     * The session itself proves the user owns the Identa account; binding
     * Google to it only succeeds when (1) the ID token's email matches the
     * account email and (2) that Google subject isn't already claimed by
     * someone else.
     */
    public function linkGoogle(Request $request, User $user, string $idToken): User
    {
        $googleUser = $this->googleIdentityService->verifyIdToken($idToken);

        $linked = DB::transaction(function () use ($user, $googleUser): User {
            /** @var User $fresh */
            $fresh = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();

            if ($fresh->google_id !== null) {
                throw ValidationException::withMessages([
                    'id_token' => [__('api.auth.google_link_already_linked')],
                ]);
            }

            // Cross-user collision: a different Identa row already owns this
            // Google subject. Should never happen unless the user has two
            // accounts under different emails, but we still want a clean
            // 422 instead of a unique-index 500.
            $collision = User::query()
                ->where('google_id', $googleUser['sub'])
                ->whereKeyNot($fresh->id)
                ->exists();
            if ($collision) {
                throw ValidationException::withMessages([
                    'id_token' => [__('api.auth.google_link_conflict')],
                ]);
            }

            if (! hash_equals(strtolower($fresh->email), strtolower((string) $googleUser['email']))) {
                throw ValidationException::withMessages([
                    'id_token' => [__('api.auth.google_link_email_mismatch')],
                ]);
            }

            $fresh->forceFill([
                'google_id' => $googleUser['sub'],
                'avatar_url' => $googleUser['picture'] ?? $fresh->avatar_url,
                'email_verified_at' => $fresh->email_verified_at ?? now(),
            ])->save();

            return $fresh->fresh();
        });

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'auth.google_linked',
            entityType: 'user',
            entityId: (string) $linked->id,
            metadata: [
                'has_password' => $linked->password !== null,
            ],
        );

        return $linked;
    }

    /**
     * Detach the Google identity from the currently-authenticated user.
     *
     * Refuses to unlink when no password is set — otherwise the user would
     * lock themselves out (no email/password fallback, no Google). They
     * must use forgot-password to set one first, then disconnect.
     */
    public function unlinkGoogle(Request $request, User $user): User
    {
        $unlinked = DB::transaction(function () use ($user): User {
            /** @var User $fresh */
            $fresh = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();

            if ($fresh->google_id === null) {
                throw ValidationException::withMessages([
                    'provider' => [__('api.auth.google_unlink_not_linked')],
                ]);
            }

            if ($fresh->password === null) {
                throw ValidationException::withMessages([
                    'provider' => [__('api.auth.google_unlink_needs_password')],
                ]);
            }

            $fresh->forceFill([
                'google_id' => null,
                // Provider flips back to email so the canonical sign-in
                // method shown in Settings is accurate.
                'provider' => 'email',
            ])->save();

            return $fresh->fresh();
        });

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'auth.google_unlinked',
            entityType: 'user',
            entityId: (string) $unlinked->id,
        );

        return $unlinked;
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
            // Don't store the typo'd email in audit metadata — anyone with
            // audit-log access (in future expansions) could enumerate
            // attempted addresses, which is a low-grade PII leak. The
            // request-context middleware (AttachRequestContext) already
            // captures the IP + UA in the audit row's actor envelope,
            // which is enough for rate/abuse forensics.
            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'auth.login_failed',
                metadata: [
                    'portal' => $portal,
                ],
            );

            throw ValidationException::withMessages([
                'email' => [__('api.auth.invalid_credentials')],
            ]);
        }

        $request->session()->regenerate();
        $request->session()->regenerateToken();

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

        // Revoke every Sanctum personal-access token EXCEPT the one
        // currently in use (so the active session keeps working). This
        // covers the threat model where a stolen mobile token survives
        // a self-initiated password change because credential-based
        // flows don't touch PATs by default — matches the cascade in
        // AuthController::resetPassword (public reset) and the
        // dentist-block path.
        $currentToken = $user->currentAccessToken();
        $currentTokenId = $currentToken !== null && method_exists($currentToken, 'getKey')
            ? $currentToken->getKey()
            : null;
        $user->tokens()
            ->when($currentTokenId !== null, fn ($query) => $query->where('id', '!=', $currentTokenId))
            ->delete();

        $currentSessionId = $request->hasSession()
            ? $request->session()->getId()
            : null;
        $this->sessionRevocation->revokeForUsers([$user], $currentSessionId);

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
        $request->session()->regenerateToken();
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
