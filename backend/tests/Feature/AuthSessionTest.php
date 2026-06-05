<?php

namespace Tests\Feature;

use App\Models\Plan;
use App\Models\Subscription;
use App\Models\User;
use App\Services\GoogleIdentityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

class AuthSessionTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_registration_creates_dentist_with_trial_subscription(): void
    {
        $this->createTrialPlan();

        $payload = [
            'name' => 'Test Dentist',
            'email' => 'dentist@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ];

        $this->postJson('/api/v1/auth/register', $payload, $this->csrfHeaders())
            ->assertCreated()
            ->assertJsonPath('data.email', 'dentist@example.com')
            ->assertJsonPath('data.role', User::ROLE_DENTIST)
            ->assertJsonPath('data.provider', 'email')
            ->assertJsonPath('data.subscription.plan', Plan::CODE_TRIAL)
            ->assertJsonPath('data.subscription.status', Subscription::STATUS_ACTIVE);

        $this->assertDatabaseHas('users', [
            'email' => 'dentist@example.com',
            'role' => User::ROLE_DENTIST,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);
        $this->assertDatabaseHas('subscriptions', [
            'plan_code' => Plan::CODE_TRIAL,
            'billing_period' => Subscription::PERIOD_TRIAL,
            'status' => Subscription::STATUS_ACTIVE,
        ]);
    }

    public function test_public_registration_rejects_duplicate_email(): void
    {
        $this->createTrialPlan();
        User::factory()->create(['email' => 'blocked-signup@example.com']);

        $payload = [
            'name' => 'Blocked Signup',
            'email' => 'blocked-signup@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ];

        $this->postJson('/api/v1/auth/register', $payload, $this->csrfHeaders())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    }

    public function test_user_can_login_and_fetch_profile_via_session(): void
    {
        $user = User::factory()->create([
            'email' => 'dentist@example.com',
            'password' => 'password123',
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'dentist@example.com',
            'password' => 'password123',
        ], $this->csrfHeaders())->assertOk();

        $this->actingAs($user, 'web')
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'dentist@example.com');
    }

    public function test_mobile_login_can_request_bearer_token_and_fetch_profile(): void
    {
        User::factory()->create([
            'email' => 'mobile-dentist@example.com',
            'password' => 'password123',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'mobile-dentist@example.com',
            'password' => 'password123',
            'device_name' => 'Identa iPhone',
        ], $this->csrfHeaders())
            ->assertOk()
            ->assertJsonPath('data.email', 'mobile-dentist@example.com')
            ->assertJsonPath('data.tokens.token_type', 'Bearer')
            ->assertJsonPath('data.tokens.expires_in', 900);
        $token = $response->json('data.tokens.access_token');
        $refreshToken = $response->json('data.tokens.refresh_token');

        $this->assertIsString($token);
        $this->assertIsString($refreshToken);

        $this
            ->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'mobile-dentist@example.com');
    }

    public function test_mobile_google_login_can_request_bearer_token(): void
    {
        $this->createTrialPlan();
        $this->mock(GoogleIdentityService::class, function ($mock): void {
            $mock
                ->shouldReceive('verifyIdToken')
                ->once()
                ->with('google-id-token')
                ->andReturn([
                    'sub' => 'google-mobile-1',
                    'email' => 'google-mobile@example.com',
                    'email_verified' => true,
                    'name' => 'Google Mobile Dentist',
                    'picture' => 'https://example.com/avatar.png',
                ]);
        });

        $response = $this->postJson('/api/v1/auth/google', [
            'id_token' => 'google-id-token',
            'device_name' => 'Identa iPhone',
        ], $this->csrfHeaders())
            ->assertOk()
            ->assertJsonPath('data.email', 'google-mobile@example.com')
            ->assertJsonPath('data.provider', 'google')
            ->assertJsonPath('data.tokens.token_type', 'Bearer')
            ->assertJsonPath('data.tokens.expires_in', 900);

        $accessToken = $response->json('data.tokens.access_token');
        $refreshToken = $response->json('data.tokens.refresh_token');

        $this->assertIsString($accessToken);
        $this->assertIsString($refreshToken);
        $this->assertDatabaseCount('personal_access_tokens', 2);
        $this->assertDatabaseHas('users', [
            'email' => 'google-mobile@example.com',
            'provider' => 'google',
            'google_id' => 'google-mobile-1',
        ]);
    }

    public function test_google_login_rejects_silent_linking_to_email_only_account(): void
    {
        // Account-takeover regression: a dentist already exists with the
        // same email but registered via password (no google_id). Clicking
        // "Continue with Google" must NOT silently bind the Google identity
        // to that account — first-time linking has to go through the
        // authenticated Settings flow. The endpoint should reject with a
        // 422 carrying the `google_link_required` message.
        $this->createTrialPlan();
        $existing = User::factory()->create([
            'email' => 'existing@example.com',
            'password' => 'password123',
            'provider' => 'email',
            'google_id' => null,
        ]);

        $this->mock(GoogleIdentityService::class, function ($mock): void {
            $mock
                ->shouldReceive('verifyIdToken')
                ->once()
                ->andReturn([
                    'sub' => 'attacker-google-sub',
                    'email' => 'existing@example.com',
                    'email_verified' => true,
                    'name' => 'Existing Dentist',
                    'picture' => null,
                ]);
        });

        $this->postJson('/api/v1/auth/google', [
            'id_token' => 'attacker-id-token',
        ], $this->csrfHeaders())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        // The existing account stays untouched — no google_id stamped, no
        // provider flip.
        $this->assertDatabaseHas('users', [
            'id' => $existing->id,
            'provider' => 'email',
            'google_id' => null,
        ]);
    }

    public function test_google_login_accepts_returning_user_with_matching_google_id(): void
    {
        // The flip side: once an account is linked (google_id stamped), the
        // same `sub` on a subsequent Google login should authenticate
        // cleanly and refresh the avatar.
        $this->createTrialPlan();
        $user = User::factory()->create([
            'email' => 'returning@example.com',
            'password' => null,
            'provider' => 'google',
            'google_id' => 'returning-sub-1',
            'avatar_url' => 'https://example.com/old.png',
        ]);

        $this->mock(GoogleIdentityService::class, function ($mock): void {
            $mock
                ->shouldReceive('verifyIdToken')
                ->once()
                ->andReturn([
                    'sub' => 'returning-sub-1',
                    'email' => 'returning@example.com',
                    'email_verified' => true,
                    'name' => 'Returning Dentist',
                    'picture' => 'https://example.com/new.png',
                ]);
        });

        $this->postJson('/api/v1/auth/google', [
            'id_token' => 'good-id-token',
        ], $this->csrfHeaders())
            ->assertOk()
            ->assertJsonPath('data.email', 'returning@example.com')
            ->assertJsonPath('data.provider', 'google');

        $user->refresh();
        $this->assertSame('https://example.com/new.png', $user->avatar_url);
    }

    public function test_link_google_attaches_subject_to_authenticated_user(): void
    {
        $this->createTrialPlan();
        $user = User::factory()->create([
            'email' => 'owner@example.com',
            'password' => 'password123',
            'provider' => 'email',
            'google_id' => null,
        ]);

        $this->mock(GoogleIdentityService::class, function ($mock): void {
            $mock
                ->shouldReceive('verifyIdToken')
                ->once()
                ->andReturn([
                    'sub' => 'owner-google-sub',
                    'email' => 'owner@example.com',
                    'email_verified' => true,
                    'name' => 'Owner',
                    'picture' => 'https://example.com/owner.png',
                ]);
        });

        $this->actingAs($user)
            ->postJson('/api/v1/auth/google/link', ['id_token' => 'owner-token'], $this->csrfHeaders())
            ->assertOk()
            ->assertJsonPath('data.google_linked', true)
            ->assertJsonPath('data.has_password', true);

        $user->refresh();
        $this->assertSame('owner-google-sub', $user->google_id);
        $this->assertSame('https://example.com/owner.png', $user->avatar_url);
    }

    public function test_link_google_rejects_when_token_email_mismatches_account(): void
    {
        $this->createTrialPlan();
        $user = User::factory()->create([
            'email' => 'owner@example.com',
            'password' => 'password123',
            'provider' => 'email',
            'google_id' => null,
        ]);

        $this->mock(GoogleIdentityService::class, function ($mock): void {
            $mock
                ->shouldReceive('verifyIdToken')
                ->once()
                ->andReturn([
                    'sub' => 'other-sub',
                    'email' => 'someone-else@example.com',
                    'email_verified' => true,
                    'name' => 'Someone',
                    'picture' => null,
                ]);
        });

        $this->actingAs($user)
            ->postJson('/api/v1/auth/google/link', ['id_token' => 'tok'], $this->csrfHeaders())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['id_token']);

        $this->assertNull($user->fresh()->google_id);
    }

    public function test_link_google_rejects_when_already_linked(): void
    {
        $this->createTrialPlan();
        $user = User::factory()->create([
            'email' => 'owner@example.com',
            'password' => 'password123',
            'provider' => 'google',
            'google_id' => 'already-linked-sub',
        ]);

        $this->mock(GoogleIdentityService::class, function ($mock): void {
            $mock
                ->shouldReceive('verifyIdToken')
                ->once()
                ->andReturn([
                    'sub' => 'another-sub',
                    'email' => 'owner@example.com',
                    'email_verified' => true,
                    'name' => 'Owner',
                    'picture' => null,
                ]);
        });

        $this->actingAs($user)
            ->postJson('/api/v1/auth/google/link', ['id_token' => 'tok'], $this->csrfHeaders())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['id_token']);

        $this->assertSame('already-linked-sub', $user->fresh()->google_id);
    }

    public function test_link_google_rejects_when_subject_claimed_by_another_user(): void
    {
        $this->createTrialPlan();
        $owner = User::factory()->create([
            'email' => 'owner@example.com',
            'password' => 'password123',
            'provider' => 'email',
            'google_id' => null,
        ]);
        User::factory()->create([
            'email' => 'other@example.com',
            'password' => null,
            'provider' => 'google',
            'google_id' => 'shared-sub',
        ]);

        $this->mock(GoogleIdentityService::class, function ($mock): void {
            $mock
                ->shouldReceive('verifyIdToken')
                ->once()
                ->andReturn([
                    'sub' => 'shared-sub',
                    'email' => 'owner@example.com',
                    'email_verified' => true,
                    'name' => 'Owner',
                    'picture' => null,
                ]);
        });

        $this->actingAs($owner)
            ->postJson('/api/v1/auth/google/link', ['id_token' => 'tok'], $this->csrfHeaders())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['id_token']);

        $this->assertNull($owner->fresh()->google_id);
    }

    public function test_unlink_google_detaches_subject_when_password_exists(): void
    {
        $this->createTrialPlan();
        $user = User::factory()->create([
            'email' => 'dual@example.com',
            'password' => 'password123',
            'provider' => 'google',
            'google_id' => 'dual-sub',
        ]);

        $this->actingAs($user)
            ->deleteJson('/api/v1/auth/google/link', [], $this->csrfHeaders())
            ->assertOk()
            ->assertJsonPath('data.google_linked', false);

        $user->refresh();
        $this->assertNull($user->google_id);
        $this->assertSame('email', $user->provider);
    }

    public function test_unlink_google_rejects_when_no_password_set(): void
    {
        $this->createTrialPlan();
        $user = User::factory()->create([
            'email' => 'google-only@example.com',
            'password' => null,
            'provider' => 'google',
            'google_id' => 'google-only-sub',
        ]);

        $this->actingAs($user)
            ->deleteJson('/api/v1/auth/google/link', [], $this->csrfHeaders())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['provider']);

        $this->assertSame('google-only-sub', $user->fresh()->google_id);
    }

    public function test_unlink_google_rejects_when_not_linked(): void
    {
        $this->createTrialPlan();
        $user = User::factory()->create([
            'email' => 'pw-only@example.com',
            'password' => 'password123',
            'provider' => 'email',
            'google_id' => null,
        ]);

        $this->actingAs($user)
            ->deleteJson('/api/v1/auth/google/link', [], $this->csrfHeaders())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['provider']);
    }

    public function test_mobile_refresh_rotates_refresh_token_and_returns_new_access_token(): void
    {
        User::factory()->create([
            'email' => 'mobile-refresh@example.com',
            'password' => 'password123',
        ]);

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'mobile-refresh@example.com',
            'password' => 'password123',
            'device_name' => 'Identa iPhone',
        ], $this->csrfHeaders())
            ->assertOk();
        $accessToken = $login->json('data.tokens.access_token');
        $refreshToken = $login->json('data.tokens.refresh_token');

        $this->assertIsString($accessToken);
        $this->assertIsString($refreshToken);
        $this->assertDatabaseCount('personal_access_tokens', 2);

        $refresh = $this->postJson('/api/v1/auth/refresh', [
            'refresh_token' => $refreshToken,
        ])
            ->assertOk()
            ->assertJsonPath('data.tokens.token_type', 'Bearer')
            ->assertJsonPath('data.tokens.expires_in', 900);

        $nextAccessToken = $refresh->json('data.tokens.access_token');
        $nextRefreshToken = $refresh->json('data.tokens.refresh_token');

        $this->assertIsString($nextAccessToken);
        $this->assertIsString($nextRefreshToken);
        $this->assertNotSame($accessToken, $nextAccessToken);
        $this->assertNotSame($refreshToken, $nextRefreshToken);
        $this->assertDatabaseCount('personal_access_tokens', 2);

        $this->postJson('/api/v1/auth/refresh', [
            'refresh_token' => $refreshToken,
        ])->assertUnauthorized();

        $this
            ->withHeader('Authorization', "Bearer {$nextAccessToken}")
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'mobile-refresh@example.com');
    }

    public function test_mobile_logout_revokes_current_bearer_token(): void
    {
        User::factory()->create([
            'email' => 'mobile-logout@example.com',
            'password' => 'password123',
        ]);

        $token = $this->postJson('/api/v1/auth/login', [
            'email' => 'mobile-logout@example.com',
            'password' => 'password123',
            'device_name' => 'Identa iPhone',
        ], $this->csrfHeaders())
            ->assertOk()
            ->json('data.tokens.access_token');

        $this->assertIsString($token);
        $this->assertDatabaseCount('personal_access_tokens', 2);

        $this
            ->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/auth/logout')
            ->assertNoContent();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_login_rejects_invalid_credentials(): void
    {
        User::factory()->create([
            'email' => 'dentist-invalid@example.com',
            'password' => 'password123',
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'dentist-invalid@example.com',
            'password' => 'wrong-password',
        ], $this->csrfHeaders())->assertStatus(422);
    }

    public function test_blocked_account_cannot_login(): void
    {
        User::factory()->create([
            'email' => 'blocked@example.com',
            'password' => 'password123',
            'account_status' => User::ACCOUNT_STATUS_BLOCKED,
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'blocked@example.com',
            'password' => 'password123',
        ], $this->csrfHeaders())
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_login_with_remember_me_sets_recaller_cookie(): void
    {
        User::factory()->create([
            'email' => 'remember@example.com',
            'password' => 'password123',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'remember@example.com',
            'password' => 'password123',
            'remember' => true,
        ], $this->csrfHeaders())->assertOk();

        $recallerName = Auth::guard('web')->getRecallerName();
        $recallerCookie = collect($response->headers->getCookies())
            ->first(fn ($cookie) => $cookie->getName() === $recallerName);

        $this->assertNotNull($recallerCookie);
        $ttlMinutes = $recallerCookie->getExpiresTime() > 0
            ? (int) floor(($recallerCookie->getExpiresTime() - time()) / 60)
            : null;

        $this->assertNotNull($ttlMinutes);
        $this->assertGreaterThanOrEqual((60 * 24 * 30) - 2, $ttlMinutes);
        $this->assertLessThanOrEqual(60 * 24 * 30, $ttlMinutes);
    }

    /**
     * @return array<string, string>
     */
    private function csrfHeaders(): array
    {
        $response = $this->get('/sanctum/csrf-cookie');
        $response->assertNoContent();

        $tokenCookie = collect($response->headers->getCookies())
            ->first(fn ($cookie) => $cookie->getName() === 'XSRF-TOKEN');

        return [
            'X-XSRF-TOKEN' => urldecode((string) $tokenCookie?->getValue()),
        ];
    }

    private function createTrialPlan(): Plan
    {
        /** @var Plan $plan */
        $plan = Plan::query()->updateOrCreate(['code' => Plan::CODE_TRIAL], [
            'code' => Plan::CODE_TRIAL,
            'name' => 'Trial',
            'description' => null,
            'is_trial' => true,
            'is_paid' => false,
            'trial_days' => 30,
            'monthly_price' => null,
            'yearly_price' => null,
            'currency' => 'UZS',
            'staff_limit' => 1,
            'entry_image_limit' => 2,
            'upload_max_mb' => 1,
            'stored_image_max_mb' => 0.5,
            'can_export' => false,
            'is_active' => true,
            'sort_order' => 10,
        ]);

        return $plan;
    }
}
