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
            ->assertJsonPath('data.status', User::ACCOUNT_STATUS_ACTIVE)
            ->assertJsonPath('data.subscription.plan', User::SUBSCRIPTION_PLAN_TRIAL)
            ->assertJsonPath('data.subscription.status', User::SUBSCRIPTION_STATUS_TRIALING)
            ->assertJsonPath('data.subscription.staff_limit', User::STAFF_LIMIT_TRIAL);

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

    public function test_admin_can_manage_dentist_subscription_lifecycle(): void
    {
        $admin = User::factory()->admin()->create();
        $dentist = User::factory()->create([
            'role' => User::ROLE_DENTIST,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);
        $dentist->startFreeTrial();

        $this->actingAs($admin, 'web')
            ->postJson("/api/v1/admin/dentists/{$dentist->id}/subscription", [
                'action' => 'activate_monthly',
                'payment_method' => 'cash',
                'payment_amount' => 450000,
                'note' => 'Cash payment received.',
            ])
            ->assertOk()
            ->assertJsonPath('data.subscription.plan', User::SUBSCRIPTION_PLAN_MONTHLY)
            ->assertJsonPath('data.subscription.status', User::SUBSCRIPTION_STATUS_ACTIVE)
            ->assertJsonPath('data.subscription.payment_method', 'cash')
            ->assertJsonPath('data.subscription.payment_amount', 450000.0);

        $originalEnd = $dentist->fresh()->subscription_ends_at;
        $this->assertNotNull($originalEnd);

        $this->actingAs($admin, 'web')
            ->postJson("/api/v1/admin/dentists/{$dentist->id}/subscription", [
                'action' => 'extend_monthly',
                'payment_method' => 'p2p',
                'payment_amount' => 500000,
            ])
            ->assertOk()
            ->assertJsonPath('data.subscription.payment_method', 'p2p');

        $dentist->refresh();
        $this->assertNotNull($dentist->subscription_ends_at);
        $this->assertTrue($dentist->subscription_ends_at->greaterThan($originalEnd));

        $this->actingAs($admin, 'web')
            ->postJson("/api/v1/admin/dentists/{$dentist->id}/subscription", [
                'action' => 'cancel_at_period_end',
                'note' => 'Dentist requested cancellation.',
            ])
            ->assertOk()
            ->assertJsonPath('data.subscription.cancel_at_period_end', true);

        $this->actingAs($admin, 'web')
            ->postJson("/api/v1/admin/dentists/{$dentist->id}/subscription", [
                'action' => 'cancel_now',
                'note' => 'Immediate cancellation requested.',
            ])
            ->assertOk()
            ->assertJsonPath('data.subscription.status', User::SUBSCRIPTION_STATUS_READ_ONLY)
            ->assertJsonPath('data.subscription.is_read_only', true);

        $this->assertDatabaseHas('audit_logs', [
            'event_type' => 'admin.dentist.subscription_updated',
            'entity_id' => (string) $dentist->id,
        ]);
    }

    public function test_trial_subscription_limits_active_assistants(): void
    {
        $dentist = User::factory()->create([
            'role' => User::ROLE_DENTIST,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);
        $dentist->startFreeTrial();

        User::factory()->create([
            'role' => User::ROLE_ASSISTANT,
            'dentist_owner_id' => $dentist->id,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/team/assistants', [
                'name' => 'Second Assistant',
                'email' => 'assistant-two@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
                'permissions' => User::defaultAssistantPermissions(),
            ], $this->csrfHeaders())
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['permissions']);
    }

    public function test_read_only_subscription_blocks_mutations_but_allows_reads(): void
    {
        $dentist = User::factory()->create([
            'role' => User::ROLE_DENTIST,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
            'subscription_plan' => User::SUBSCRIPTION_PLAN_MONTHLY,
            'subscription_started_at' => now()->subMonths(2),
            'subscription_ends_at' => now()->subDays(User::SUBSCRIPTION_GRACE_DAYS + 2),
            'trial_ends_at' => null,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients')
            ->assertOk();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/patient-categories', [
                'name' => 'Read only category',
            ], $this->csrfHeaders())
            ->assertForbidden()
            ->assertJsonPath('error.code', 'subscription_read_only');
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
