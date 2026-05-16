<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Services\AuthService;
use App\Support\AuditLogger;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    private const MOBILE_ACCESS_TTL_MINUTES = 15;

    private const MOBILE_REFRESH_TTL_DAYS = 30;

    private const MOBILE_REFRESH_ABILITY = 'mobile:refresh';

    public function __construct(
        private readonly AuditLogger $auditLogger,
        private readonly AuthService $auth,
    ) {}

    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
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

    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
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
            || ! $refreshToken->tokenable->hasActiveAccount()
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
            if ($currentToken !== null && method_exists($currentToken, 'delete')) {
                $this->deleteMobileTokensForDevice($user, (string) $currentToken->name);
            }

            $bearerToken = $request->bearerToken();
            if ($bearerToken !== null) {
                $token = PersonalAccessToken::findToken($bearerToken);
                if ($token !== null && $token->tokenable instanceof User) {
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
            'new_password' => ['required', 'string', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ];

        $requiresCurrentPassword = ! $user->must_change_password && $user->password !== null;

        if ($requiresCurrentPassword) {
            $rules['current_password'] = ['required', 'string'];
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

        if ($status === Password::RESET_THROTTLED) {
            throw ValidationException::withMessages([
                'email' => [__($status)],
            ]);
        }

        return response()->json([
            'message' => __(Password::RESET_LINK_SENT),
        ]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
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
