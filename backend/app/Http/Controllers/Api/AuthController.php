<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {
    }

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::guard('web')->attempt($credentials)) {
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

        /** @var \App\Models\User $user */
        $user = $request->user();

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

            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

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

                Auth::guard('web')->logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();

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
        );

        return response()->json([
            'data' => $this->transformUser($user),
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
        }

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([], 204);
    }

    public function changePassword(Request $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = $request->user();

        $rules = [
            'new_password' => ['required', 'string', 'min:8', 'confirmed'],
        ];

        if (! $user->must_change_password) {
            $rules['current_password'] = ['required', 'string'];
        }

        $validated = $request->validate($rules);

        if (
            ! $user->must_change_password
            && ! Hash::check((string) $validated['current_password'], (string) $user->password)
        ) {
            throw ValidationException::withMessages([
                'current_password' => ['Current password is incorrect.'],
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

        return response()->json([
            'data' => $this->transformUser($user),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        /** @var \App\Models\User $user */
        $user = $request->user();

        return response()->json([
            'data' => $this->transformUser($user),
        ]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
        ]);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'auth.password_reset_requested',
            metadata: [
                'email' => $request->string('email')->toString(),
            ],
        );

        $status = Password::sendResetLink(
            $request->only('email')
        );

        if ($status !== Password::RESET_LINK_SENT) {
            throw ValidationException::withMessages([
                'email' => [__($status)],
            ]);
        }

        return response()->json([
            'message' => __($status),
        ]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $resetUserId = null;

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) use (&$resetUserId): void {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                ])->save();
                $resetUserId = (string) $user->id;

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages([
                'email' => [__($status)],
            ]);
        }

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'auth.password_reset_completed',
            entityType: $resetUserId !== null ? 'user' : null,
            entityId: $resetUserId,
            metadata: [
                'email' => $request->string('email')->toString(),
            ],
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
        return [
            'id' => (string) $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'account_status' => $user->account_status,
            'dentist_owner_id' => $user->dentist_owner_id !== null ? (string) $user->dentist_owner_id : null,
            'assistant_permissions' => $user->assistant_permissions ?? [],
            'must_change_password' => (bool) $user->must_change_password,
            'subscription' => $user->subscriptionOwner()?->subscriptionSummary(),
        ];
    }
}
