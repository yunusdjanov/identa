<?php

namespace Tests\Feature;

use App\Support\AuditLogger;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditLogApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_list_tenant_audit_logs_including_assistant_actions(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [
                User::PERMISSION_PATIENTS_MANAGE,
            ],
        ]);
        $logger = app(AuditLogger::class);

        $logger->log(
            actor: $assistant,
            eventType: 'patient.created',
            entityType: 'patient',
            entityId: 'assistant-patient',
        );

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/audit-logs')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 1)
            ->assertJsonPath('data.0.event_type', 'patient.created')
            ->assertJsonPath('data.0.actor.id', (string) $assistant->id)
            ->assertJsonPath('data.0.actor.role', User::ROLE_ASSISTANT);
    }

    public function test_assistant_cannot_access_audit_endpoint_even_with_permission_flag(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [User::PERMISSION_AUDIT_LOGS_VIEW],
        ]);

        $this->actingAs($assistant, 'web')
            ->getJson('/api/v1/audit-logs')
            ->assertForbidden();
    }

    public function test_audit_logs_are_scoped_per_dentist_tenant(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $logger = app(AuditLogger::class);

        $logger->log(
            actor: $dentist,
            eventType: 'patient.created',
            entityType: 'patient',
            entityId: 'tenant-1-patient',
        );

        $logger->log(
            actor: $otherDentist,
            eventType: 'patient.created',
            entityType: 'patient',
            entityId: 'tenant-2-patient',
        );

        $this->assertDatabaseHas('audit_logs', [
            'dentist_id' => $dentist->id,
            'entity_id' => 'tenant-1-patient',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'dentist_id' => $otherDentist->id,
            'entity_id' => 'tenant-2-patient',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/audit-logs')
            ->assertOk()
            ->assertJsonFragment([
                'entity_type' => 'patient',
                'entity_id' => 'tenant-1-patient',
            ])
            ->assertJsonMissing([
                'entity_id' => 'tenant-2-patient',
            ]);
    }

    public function test_hidden_event_types_are_not_returned_in_audit_logs_response(): void
    {
        $dentist = User::factory()->create();
        $logger = app(AuditLogger::class);

        $logger->log(
            actor: $dentist,
            eventType: 'auth.login',
            entityType: 'auth',
            entityId: 'login-event',
        );
        $logger->log(
            actor: $dentist,
            eventType: 'team.assistant.created',
            entityType: 'user',
            entityId: 'assistant-event',
        );
        $logger->log(
            actor: $dentist,
            eventType: 'patient.created',
            entityType: 'patient',
            entityId: 'patient-event',
        );

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/audit-logs')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 1)
            ->assertJsonPath('data.0.event_type', 'patient.created')
            ->assertJsonMissing([
                'event_type' => 'auth.login',
            ])
            ->assertJsonMissing([
                'event_type' => 'team.assistant.created',
            ]);
    }
}
