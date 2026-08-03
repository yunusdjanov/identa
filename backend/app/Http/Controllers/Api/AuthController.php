<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuthService;
use App\Services\SessionRevocationService;
use App\Support\AuditLogger;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Events\Verified;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    private const MAX_EMAIL_LENGTH = 255;

    private const MAX_PASSWORD_LENGTH = 255;

    private const MAX_RESET_TOKEN_LENGTH = 255;

    private const ADMIN_MIN_PASSWORD_LENGTH = 12;

    private const MOBILE_ACCESS_TTL_MINUTES = 15;

    private const MOBILE_REFRESH_TTL_DAYS = 30;

    private const MOBILE_REFRESH_ABILITY = 'mobile:refresh';

    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly AuthService $auth,
        private readonly SessionRevocationService $sessionRevocation,
    ) {}

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:'.self::MAX_EMAIL_LENGTH, Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'max:'.self::MAX_PASSWORD_LENGTH, 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ]);

        return response()->json([
            'data' => $this->transformUser($this->auth->register($request, $validated)),
        ], 201);
    }

    public function google(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id_token' => ['required', 'string'],
            'device_name' => ['nullable', 'string', 'max:120'],
        ]);
        $deviceName = trim((string) ($validated['device_name'] ?? ''));
        $user = $this->auth->google($request, (string) $validated['id_token']);
        $data = $this->transformUser($user);

        if ($deviceName !== '') {
            $data['tokens'] = $this->issueMobileTokens($user, $deviceName);
        }

        return response()->json([
            'data' => $data,
        ]);
    }

    public function linkGoogle(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id_token' => ['required', 'string'],
        ]);
        /** @var User $user */
        $user = $request->user();
        $linked = $this->auth->linkGoogle($request, $user, (string) $validated['id_token']);

        return response()->json([
            'data' => $this->transformUser($linked),
        ]);
    }

    public function unlinkGoogle(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $unlinked = $this->auth->unlinkGoogle($request, $user);

        return response()->json([
            'data' => $this->transformUser($unlinked),
        ]);
    }

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email', 'max:'.self::MAX_EMAIL_LENGTH],
            'password' => ['required', 'string', 'max:'.self::MAX_PASSWORD_LENGTH],
            'remember' => ['nullable', 'boolean'],
            'portal' => ['nullable', 'string', Rule::in(['app', 'admin'])],
            'device_name' => ['nullable', 'string', 'max:120'],
        ]);
        $deviceName = trim((string) ($credentials['device_name'] ?? ''));
        unset($credentials['device_name']);
        $user = $this->auth->login($request, $credentials);
        $data = $this->transformUser($user);

        if ($deviceName !== '') {
            $data['tokens'] = $this->issueMobileTokens($user, $deviceName);
        }

        return response()->json([
            'data' => $data,
        ]);
    }

    public function refresh(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'refresh_token' => ['required_without:refreshToken', 'string'],
            'refreshToken' => ['nullable', 'string'],
        ]);
        $plainRefreshToken = (string) ($validated['refresh_token'] ?? $validated['refreshToken'] ?? '');
        $refreshToken = PersonalAccessToken::findToken($plainRefreshToken);

        if (
            $refreshToken === null
            || ! $refreshToken->can(self::MOBILE_REFRESH_ABILITY)
            || ($refreshToken->expires_at !== null && $refreshToken->expires_at->isPast())
            || ! $refreshToken->tokenable instanceof User
            || ! $refreshToken->tokenable->hasActiveAccessChain()
        ) {
            return response()->json([
                'message' => __('auth.failed'),
            ], 401);
        }

        /** @var User $user */
        $user = $refreshToken->tokenable;
        $deviceName = trim((string) $refreshToken->name) ?: 'Identa Mobile';
        $this->deleteMobileTokensForDevice($user, $deviceName);
        $data = $this->transformUser($user);
        $data['tokens'] = $this->issueMobileTokens($user, $deviceName, deleteExisting: false);

        return response()->json([
            'data' => $data,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        /** @var User|null $user */
        $user = $request->user();
        if ($user !== null) {
            $this->auditLogger->logFromRequest(
                request: $request,
                eventType: 'auth.logout',
                entityType: 'user',
                entityId: (string) $user->id,
            );

            $currentToken = $user->currentAccessToken();
            if ($currentToken instanceof PersonalAccessToken) {
                $this->deleteMobileTokensForDevice($user, (string) $currentToken->name);
            } else {
                // A browser-authenticated request gets Sanctum's transient
                // token. If it also supplies one of this user's bearer
                // tokens, revoke the matching mobile access/refresh pair.
                $bearerToken = $request->bearerToken();
                $token = $bearerToken !== null
                    ? PersonalAccessToken::findToken($bearerToken)
                    : null;
                if (
                    $token !== null
                    && $token->tokenable instanceof User
                    && $token->tokenable->is($user)
                ) {
                    $this->deleteMobileTokensForDevice($token->tokenable, (string) $token->name);
                }
            }
        }

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([], 204);
    }

    public function changePassword(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $rules = [
            'new_password' => ['required', 'string', 'max:'.self::MAX_PASSWORD_LENGTH, 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ];

        $requiresCurrentPassword = ! $user->must_change_password && $user->password !== null;

        if ($requiresCurrentPassword) {
            $rules['current_password'] = ['required', 'string', 'max:'.self::MAX_PASSWORD_LENGTH];
        }

        $validated = $request->validate($rules);

        return response()->json([
            'data' => $this->transformUser(
                $this->auth->changePassword($request, $user, $validated, $requiresCurrentPassword)
            ),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // /me is the SPA's session probe and carries the owner's subscription
        // summary, so it must honour the same access chain as the data routes:
        // a blocked/deleted dentist's assistant gets bounced to login cleanly.
        if (! $user->hasActiveAccessChain()) {
            return response()->json([
                'error' => [
                    'code' => 'account_inactive',
                    'message' => __('api.auth.account_inactive'),
                ],
            ], 403);
        }

        return response()->json([
            'data' => $this->transformUser($user),
        ]);
    }

    /**
     * Verify an email via the signed link from the verification email, then
     * bounce the user back to the SPA with a status. Auth is provided by the
     * signed URL (the `signed` middleware), so no session is required.
     */
    public function verifyEmail(Request $request, string $id, string $hash): RedirectResponse
    {
        $status = 'invalid';

        /** @var User|null $user */
        $user = User::query()->find($id);

        if (
            $user !== null
            && $user->account_status !== User::ACCOUNT_STATUS_DELETED
            && hash_equals((string) $hash, sha1($user->getEmailForVerification()))
        ) {
            if ($user->hasVerifiedEmail()) {
                $status = 'already';
            } elseif ($user->markEmailAsVerified()) {
                event(new Verified($user));

                $this->auditLogger->logFromRequest(
                    request: $request,
                    eventType: 'auth.email_verified',
                    entityType: 'user',
                    entityId: (string) $user->id,
                );

                $status = 'success';
            }
        }

        $frontend = rtrim(explode(',', (string) config('app.frontend_url'))[0], '/');

        return redirect()->away($frontend.'/verify-email?status='.$status);
    }

    /**
     * Resend the email-verification link to the authenticated user.
     */
    public function resendEmailVerification(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json([
                'message' => __('api.auth.email_already_verified'),
                'email_verified' => true,
            ]);
        }

        try {
            $user->sendEmailVerificationNotification();
            // Cleanup uses updated_at as the abandonment clock. A user who
            // explicitly requests another verification email is active, so
            // grant a fresh retention window only after delivery dispatch
            // succeeds.
            $user->touch();
        } catch (\Throwable $exception) {
            Log::warning('Failed to resend verification email', [
                'user_id' => $user->id,
                'error' => $exception->getMessage(),
            ]);

            throw ValidationException::withMessages([
                'email' => [__('api.auth.email_verification_send_failed')],
            ]);
        }

        return response()->json([
            'message' => __('api.auth.email_verification_sent'),
            'email_verified' => false,
        ]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email', 'max:'.self::MAX_EMAIL_LENGTH],
        ]);

        // Resolve the dentist whose account is being abused so the audit
        // row lands on their tenant. Without this, password-reset probes
        // are written with `dentist_id=null` and the victim can never see
        // the attempt in their own /audit-logs panel. We DO NOT log the
        // typed email — that's a low-grade enumeration vector — only
        // the resolved dentist_id (null when the email doesn't match).
        $email = $request->string('email')->toString();
        $targetUser = \App\Models\User::query()
            ->where('email', $email)
            ->whereNull('deleted_at')
            ->first();
        $tenantDentistId = $targetUser?->tenantDentistId();

        $this->auditLogger->log(
            actor: null,
            eventType: 'auth.password_reset_requested',
            tenantDentistId: $tenantDentistId,
            metadata: [
                'has_match' => $targetUser !== null,
            ],
        );

        try {
            // Always return the same public response for an unknown user,
            // a broker-throttled user, and a successfully notified user.
            // Surfacing RESET_THROTTLED would let repeated probes distinguish
            // a real account from an address that is not registered.
            Password::sendResetLink($request->only('email'));
        } catch (\Throwable $exception) {
            // Delivery failures are operationally visible without exposing
            // whether the submitted address belongs to an account. Do not log
            // the email or the transport message: both can contain PII.
            Log::warning('Password reset notification failed', [
                'user_id' => $targetUser?->id,
                'exception_class' => $exception::class,
            ]);
        }

        return response()->json([
            'message' => __(Password::RESET_LINK_SENT),
        ]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string', 'max:'.self::MAX_RESET_TOKEN_LENGTH],
            'email' => ['required', 'email', 'max:'.self::MAX_EMAIL_LENGTH],
            'password' => ['required', 'string', 'max:'.self::MAX_PASSWORD_LENGTH, 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ]);

        $resetUserId = null;
        /** @var User|null $resetUser */
        $resetUser = null;

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) use (&$resetUserId, &$resetUser): void {
                // Platform admins are provisioned with a stronger password
                // policy than practice users. Validate only after Laravel has
                // accepted the one-time token, so this distinction cannot be
                // used to enumerate admin email addresses.
                if ($user->isAdmin()) {
                    Validator::make(
                        ['password' => $password],
                        ['password' => [
                            PasswordRule::min(self::ADMIN_MIN_PASSWORD_LENGTH)
                                ->mixedCase()
                                ->numbers()
                                ->symbols(),
                        ]]
                    )->validate();
                }

                $user->forceFill([
                    'password' => Hash::make($password),
                    'must_change_password' => false,
                    'remember_token' => Str::random(60),
                ])->save();
                $resetUserId = (string) $user->id;
                $resetUser = $user;

                // Revoke every Sanctum personal-access token. Without this
                // an exfiltrated PAT survives the password reset and the
                // attacker keeps full access — the new password rotation
                // only matters for credential-based logins. Mirrors the
                // admin-driven reset path in DentistAccountController.
                $user->tokens()->delete();

                // If this user is a dentist, cascade to their assistants
                // too: a tenant password reset shouldn't leave assistant
                // PATs alive on the previous credential state.
                $sessionUsers = [$user];
                if ($user->isDentist()) {
                    foreach ($user->assistants as $assistant) {
                        $assistant->tokens()->delete();
                        $sessionUsers[] = $assistant;
                    }
                }

                $this->sessionRevocation->revokeForUsers($sessionUsers);

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => [__($status)],
            ]);
        }

        // Use `log()` (not `logFromRequest()`) so the audit row's
        // `dentist_id` is populated from the resolved user's tenant. The
        // public reset flow has no authenticated actor on the request, so
        // `logFromRequest()` would leave dentist_id null and the event
        // would be invisible to the dentist owner whose assistant just had
        // their password reset (or to the dentist themselves on a
        // self-initiated reset). Threading the resolved user as `actor`
        // keeps the tenant audit log honest. IP / user-agent are still
        // captured directly from the request to preserve forensics.
        $this->auditLogger->log(
            actor: $resetUser,
            eventType: 'auth.password_reset_completed',
            entityType: $resetUserId !== null ? 'user' : null,
            entityId: $resetUserId,
            metadata: [
                'email' => $request->string('email')->toString(),
            ],
            ipAddress: $request->ip(),
            userAgent: $request->userAgent(),
        );

        return response()->json([
            'message' => __($status),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformUser(User $user): array
    {
        return (new UserResource($user))->resolve(request());
    }

    /**
     * @return array{access_token: string, refresh_token: string, token_type: string, expires_in: int, refresh_expires_in: int}
     */
    private function issueMobileTokens(User $user, string $deviceName, bool $deleteExisting = true): array
    {
        $normalizedDeviceName = trim($deviceName) ?: 'Identa Mobile';
        if ($deleteExisting) {
            $this->deleteMobileTokensForDevice($user, $normalizedDeviceName);
        }

        $accessExpiresAt = now()->addMinutes(self::MOBILE_ACCESS_TTL_MINUTES);
        $refreshExpiresAt = now()->addDays(self::MOBILE_REFRESH_TTL_DAYS);

        return [
            'access_token' => $user->createToken($normalizedDeviceName, ['*'], $accessExpiresAt)->plainTextToken,
            'refresh_token' => $user->createToken(
                $normalizedDeviceName,
                [self::MOBILE_REFRESH_ABILITY],
                $refreshExpiresAt
            )->plainTextToken,
            'token_type' => 'Bearer',
            'expires_in' => self::MOBILE_ACCESS_TTL_MINUTES * 60,
            'refresh_expires_in' => self::MOBILE_REFRESH_TTL_DAYS * 24 * 60 * 60,
        ];
    }

    private function deleteMobileTokensForDevice(User $user, string $deviceName): void
    {
        $normalizedDeviceName = trim($deviceName);
        if ($normalizedDeviceName === '') {
            return;
        }

        $user->tokens()->where('name', $normalizedDeviceName)->delete();
    }
}
