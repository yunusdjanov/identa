<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * An assistant inherits access from its owning dentist. Blocking or deleting a
 * dentist must instantly revoke every assistant — on the data routes, on the
 * /me session probe, and on token refresh — and be reversible. Subscription
 * billing is the owner's concern only and must never be exposed to staff.
 */
class AssistantAccessRevocationTest extends TestCase
{
    use RefreshDatabase;

    public function test_assistant_can_access_data_and_profile_while_owner_is_active(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [User::PERMISSION_PATIENTS_VIEW],
        ]);

        $this->actingAs($assistant->fresh(), 'web')
            ->getJson('/api/v1/patients')
            ->assertOk();

        $this->actingAs($assistant->fresh(), 'web')
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', (string) $assistant->id);
    }

    public function test_blocking_owner_dentist_revokes_assistant_data_access(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [User::PERMISSION_PATIENTS_VIEW],
        ]);

        $dentist->update(['account_status' => User::ACCOUNT_STATUS_BLOCKED]);

        $this->actingAs($assistant->fresh(), 'web')
            ->getJson('/api/v1/patients')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'account_inactive');
    }

    public function test_blocking_owner_dentist_revokes_assistant_session_probe(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create();

        $dentist->update(['account_status' => User::ACCOUNT_STATUS_BLOCKED]);

        $this->actingAs($assistant->fresh(), 'web')
            ->getJson('/api/v1/auth/me')
            ->assertForbidden()
            ->assertJsonPath('error.code', 'account_inactive');
    }

    public function test_deleting_owner_dentist_revokes_assistant_access(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [User::PERMISSION_PATIENTS_VIEW],
        ]);

        $dentist->update(['account_status' => User::ACCOUNT_STATUS_DELETED]);

        $this->actingAs($assistant->fresh(), 'web')
            ->getJson('/api/v1/patients')
            ->assertForbidden();
    }

    public function test_reactivating_owner_dentist_restores_assistant_access(): void
    {
        // Owner starts blocked (revocation is proven by the tests above); the
        // assistant's own status stays active throughout.
        $dentist = User::factory()->create(['account_status' => User::ACCOUNT_STATUS_BLOCKED]);
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [User::PERMISSION_PATIENTS_VIEW],
        ]);

        // Reactivating the owner restores access with no per-staff fixups —
        // revocation is non-destructive and reversible.
        $dentist->update(['account_status' => User::ACCOUNT_STATUS_ACTIVE]);

        $this->actingAs($assistant->fresh(), 'web')
            ->getJson('/api/v1/patients')
            ->assertOk();
    }

    public function test_owner_dentist_can_read_billing(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist->fresh(), 'web')
            ->getJson('/api/v1/billing/current-subscription')
            ->assertOk();
    }

    public function test_assistant_cannot_read_billing(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create();

        // Assistants must not see the practice's subscription or PayX history.
        $this->actingAs($assistant->fresh(), 'web')
            ->getJson('/api/v1/billing/current-subscription')
            ->assertForbidden();

        $this->actingAs($assistant->fresh(), 'web')
            ->getJson('/api/v1/billing/payments')
            ->assertForbidden();
    }
}
