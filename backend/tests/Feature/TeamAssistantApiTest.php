<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TeamAssistantApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_manage_owned_assistants(): void
    {
        $dentist = User::factory()->create();

        $createResponse = $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/team/assistants', [
                'name' => 'Assistant One',
                'email' => 'assistant.one@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
                'phone' => '+998901112233',
                'permissions' => [
                    User::PERMISSION_PATIENTS_VIEW,
                    User::PERMISSION_APPOINTMENTS_VIEW,
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Assistant One')
            ->assertJsonPath('data.account_status', User::ACCOUNT_STATUS_ACTIVE);

        $assistantId = (string) $createResponse->json('data.id');

        $this->assertDatabaseHas('users', [
            'id' => $assistantId,
            'role' => User::ROLE_ASSISTANT,
            'dentist_owner_id' => $dentist->id,
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/team/assistants/{$assistantId}", [
                'name' => 'Assistant Updated',
                'email' => 'assistant.updated@example.com',
                'phone' => '+998901112244',
                'permissions' => [
                    User::PERMISSION_PATIENTS_VIEW,
                    User::PERMISSION_PATIENTS_MANAGE,
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Assistant Updated')
            ->assertJsonPath('data.email', 'assistant.updated@example.com');

        $this->actingAs($dentist, 'web')
            ->patchJson("/api/v1/team/assistants/{$assistantId}/status", [
                'status' => User::ACCOUNT_STATUS_BLOCKED,
            ])
            ->assertOk()
            ->assertJsonPath('data.account_status', User::ACCOUNT_STATUS_BLOCKED);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/team/assistants/{$assistantId}/reset-password", [
                'new_password' => 'newpassword123',
                'new_password_confirmation' => 'newpassword123',
            ])
            ->assertOk()
            ->assertJsonPath('data.assistant_id', $assistantId)
            ->assertJsonPath('data.password_reset', true);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/team/assistants/{$assistantId}")
            ->assertNoContent();

        $this->assertDatabaseHas('users', [
            'id' => $assistantId,
            'account_status' => User::ACCOUNT_STATUS_DELETED,
        ]);
    }

    public function test_dentist_cannot_manage_other_dentist_assistant(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $assistant = User::factory()->assistant($otherDentist)->create();

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/team/assistants/{$assistant->id}", [
                'name' => 'Should Fail',
                'email' => 'fail@example.com',
            ])
            ->assertNotFound();
    }

    public function test_assistant_is_forbidden_from_team_management_routes(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [User::PERMISSION_PATIENTS_VIEW],
        ]);

        $this->actingAs($assistant, 'web')
            ->getJson('/api/v1/team/assistants')
            ->assertForbidden();
    }

    public function test_forced_password_rotation_blocks_team_mutations(): void
    {
        $dentist = User::factory()->create([
            'must_change_password' => true,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/team/assistants', [
                'name' => 'Blocked Assistant',
                'email' => 'blocked-by-rotation@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
                'permissions' => [User::PERMISSION_PATIENTS_VIEW],
            ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'password_change_required');

        $this->assertDatabaseMissing('users', [
            'email' => 'blocked-by-rotation@example.com',
        ]);
    }

    public function test_blocked_assistant_cannot_be_reactivated_when_staff_limit_is_full(): void
    {
        $dentist = User::factory()->create([
            'subscription_plan' => User::SUBSCRIPTION_PLAN_TRIAL,
            'trial_ends_at' => now()->addDays(10),
            'subscription_started_at' => now(),
        ]);

        $blockedAssistant = User::factory()->assistant($dentist)->create([
            'account_status' => User::ACCOUNT_STATUS_ACTIVE,
        ]);

        $this->actingAs($dentist, 'web')
            ->patchJson("/api/v1/team/assistants/{$blockedAssistant->id}/status", [
                'status' => User::ACCOUNT_STATUS_BLOCKED,
            ])
            ->assertOk()
            ->assertJsonPath('data.account_status', User::ACCOUNT_STATUS_BLOCKED);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/team/assistants', [
                'name' => 'Replacement Assistant',
                'email' => 'replacement.assistant@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123',
                'phone' => '+998901112255',
                'permissions' => [
                    User::PERMISSION_PATIENTS_VIEW,
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.account_status', User::ACCOUNT_STATUS_ACTIVE);

        $this->actingAs($dentist, 'web')
            ->patchJson("/api/v1/team/assistants/{$blockedAssistant->id}/status", [
                'status' => User::ACCOUNT_STATUS_ACTIVE,
            ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'plan_staff_limit_reached');

        $this->assertDatabaseHas('users', [
            'id' => $blockedAssistant->id,
            'account_status' => User::ACCOUNT_STATUS_BLOCKED,
        ]);

        $this->assertSame(
            User::STAFF_LIMIT_TRIAL,
            User::query()
                ->where('dentist_owner_id', $dentist->id)
                ->where('role', User::ROLE_ASSISTANT)
                ->where('account_status', User::ACCOUNT_STATUS_ACTIVE)
                ->count()
        );
    }

    public function test_blocking_assistant_revokes_tokens_sessions_and_remember_cookie(): void
    {
        config()->set('session.driver', 'database');

        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'remember_token' => 'remember-me',
        ]);
        $assistant->createToken('stale-mobile-token');
        DB::table('sessions')->insert([
            'id' => 'assistant-stale-session',
            'user_id' => $assistant->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'test',
            'payload' => 'test-session',
            'last_activity' => now()->timestamp,
        ]);

        $this->actingAs($dentist, 'web')
            ->patchJson("/api/v1/team/assistants/{$assistant->id}/status", [
                'status' => User::ACCOUNT_STATUS_BLOCKED,
            ])
            ->assertOk();

        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $assistant->id,
        ]);
        $this->assertDatabaseMissing('sessions', ['id' => 'assistant-stale-session']);
        $this->assertNull($assistant->fresh()->remember_token);
    }

    public function test_deleted_assistant_cannot_be_edited_or_reactivated(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'account_status' => User::ACCOUNT_STATUS_DELETED,
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/team/assistants/{$assistant->id}", [
                'name' => 'Should stay deleted',
                'email' => 'restore-hidden@example.com',
                'permissions' => [User::PERMISSION_PATIENTS_VIEW],
            ])
            ->assertNotFound();

        $this->actingAs($dentist, 'web')
            ->patchJson("/api/v1/team/assistants/{$assistant->id}/status", [
                'status' => User::ACCOUNT_STATUS_ACTIVE,
            ])
            ->assertNotFound();

        $this->assertSame(User::ACCOUNT_STATUS_DELETED, $assistant->fresh()->account_status);
    }

    public function test_assistant_creation_requires_strong_password_and_explicit_permission(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/team/assistants', [
                'name' => 'Assistant One',
                'email' => 'weak.assistant@example.com',
                'password' => '12345678',
                'password_confirmation' => '12345678',
                'permissions' => [],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['password', 'permissions']);
    }
}
