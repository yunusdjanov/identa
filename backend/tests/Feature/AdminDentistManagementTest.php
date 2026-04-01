<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminDentistManagementTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_manage_dentist_lifecycle_and_actions_are_audited(): void
    {
        $admin = User::factory()->admin()->create();

        $createResponse = $this->actingAs($admin, 'web')
            ->postJson('/api/v1/admin/dentists', [
                'name' => 'Dr Managed',
                'email' => 'managed@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
                'practice_name' => 'Managed Practice',
            ])
            ->assertCreated()
            ->assertJsonPath('data.email', 'managed@example.com')
            ->assertJsonPath('data.status', User::ACCOUNT_STATUS_ACTIVE);

        $dentistId = $createResponse->json('data.id');

        $this->assertDatabaseHas('audit_logs', [
            'event_type' => 'admin.dentist.created',
            'entity_type' => 'user',
            'entity_id' => $dentistId,
        ]);

        $this->actingAs($admin, 'web')
            ->patchJson("/api/v1/admin/dentists/{$dentistId}/status", [
                'status' => User::ACCOUNT_STATUS_BLOCKED,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', User::ACCOUNT_STATUS_BLOCKED);

        $this->assertDatabaseHas('users', [
            'id' => $dentistId,
            'account_status' => User::ACCOUNT_STATUS_BLOCKED,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'event_type' => 'admin.dentist.status_updated',
            'entity_id' => $dentistId,
        ]);

        $this->actingAs($admin, 'web')
            ->patchJson("/api/v1/admin/dentists/{$dentistId}/status", [
                'status' => User::ACCOUNT_STATUS_ACTIVE,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', User::ACCOUNT_STATUS_ACTIVE);

        $resetResponse = $this->actingAs($admin, 'web')
            ->postJson("/api/v1/admin/dentists/{$dentistId}/reset-password", [
                'new_password' => 'newsecure123',
                'new_password_confirmation' => 'newsecure123',
            ])
            ->assertOk()
            ->assertJsonPath('data.dentist_id', $dentistId)
            ->assertJsonPath('data.password_reset', true);

        $this->assertNull($resetResponse->json('data.temporary_password'));
        $this->assertDatabaseHas('audit_logs', [
            'event_type' => 'admin.dentist.password_reset',
            'entity_id' => $dentistId,
        ]);

        $csrf = $this->csrfHeaders();
        $this->postJson('/api/v1/auth/login', [
            'email' => 'managed@example.com',
            'password' => 'newsecure123',
        ], $csrf)->assertOk();

        $this->actingAs($admin, 'web')
            ->deleteJson("/api/v1/admin/dentists/{$dentistId}")
            ->assertNoContent();

        $this->assertDatabaseHas('users', [
            'id' => $dentistId,
            'account_status' => User::ACCOUNT_STATUS_DELETED,
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'event_type' => 'admin.dentist.deleted',
            'entity_id' => $dentistId,
        ]);
    }

    public function test_admin_can_filter_dentists_by_search_and_status(): void
    {
        $admin = User::factory()->admin()->create();

        User::factory()->create([
            'name' => 'Alpha Dentist',
            'email' => 'alpha@example.com',
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);
        User::factory()->create([
            'name' => 'Blocked Dentist',
            'email' => 'blocked-list@example.com',
            'account_status' => User::ACCOUNT_STATUS_BLOCKED,
        ]);

        $this->actingAs($admin, 'web')
            ->getJson('/api/v1/admin/dentists?filter[status]=blocked')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.summary.total_count', 2)
            ->assertJsonPath('meta.summary.active_count', 1)
            ->assertJsonPath('meta.summary.new_registrations_7d', 2)
            ->assertJsonPath('data.0.email', 'blocked-list@example.com');

        $this->actingAs($admin, 'web')
            ->getJson('/api/v1/admin/dentists?filter[search]=alpha')
            ->assertOk()
            ->assertJsonPath('data.0.email', 'alpha@example.com');
    }

    public function test_admin_password_reset_requires_password_confirmation(): void
    {
        $admin = User::factory()->admin()->create();
        $dentist = User::factory()->create([
            'role' => User::ROLE_DENTIST,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);

        $this->actingAs($admin, 'web')
            ->postJson("/api/v1/admin/dentists/{$dentist->id}/reset-password", [
                'new_password' => 'newsecure123',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['new_password']);
    }

    public function test_admin_create_dentist_validates_name_and_practice_min_length(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin, 'web')
            ->postJson('/api/v1/admin/dentists', [
                'name' => 'Al',
                'email' => 'validation-admin@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
                'practice_name' => 'AB',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'practice_name']);
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
