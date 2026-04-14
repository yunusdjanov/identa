<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\TestCase;

class AuthSessionTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_registration_route_is_not_available(): void
    {
        $payload = [
            'name' => 'Test Dentist',
            'email' => 'dentist@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ];

        $this->postJson('/api/v1/auth/register', $payload, $this->csrfHeaders())
            ->assertNotFound();
    }

    public function test_public_registration_route_does_not_create_a_user(): void
    {
        $payload = [
            'name' => 'Blocked Signup',
            'email' => 'blocked-signup@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ];

        $this->postJson('/api/v1/auth/register', $payload, $this->csrfHeaders())
            ->assertNotFound();

        $this->assertDatabaseMissing('users', [
            'email' => 'blocked-signup@example.com',
        ]);
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
        $this->assertGreaterThanOrEqual((60 * 24 * 7) - 2, $ttlMinutes);
        $this->assertLessThanOrEqual(60 * 24 * 7, $ttlMinutes);
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
}
