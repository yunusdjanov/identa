<?php

namespace Tests\Unit;

use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

class AuditLoggerTest extends TestCase
{
    use RefreshDatabase;

    public function test_log_persists_actor_event_and_metadata_payload(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_DENTIST,
        ]);

        $logger = app(AuditLogger::class);
        $entry = $logger->log(
            actor: $actor,
            eventType: 'patient.created',
            entityType: 'patient',
            entityId: 'patient-123',
            metadata: ['patient_id' => 'PT-001'],
            ipAddress: '127.0.0.1',
            userAgent: 'Unit Test Agent',
        );

        $this->assertDatabaseHas('audit_logs', [
            'id' => $entry->id,
            'actor_id' => $actor->id,
            'dentist_id' => $actor->id,
            'actor_role' => User::ROLE_DENTIST,
            'event_type' => 'patient.created',
            'entity_type' => 'patient',
            'entity_id' => 'patient-123',
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Unit Test Agent',
        ]);

        $this->assertSame(['patient_id' => 'PT-001'], $entry->metadata);
    }

    public function test_log_from_request_uses_request_context_and_empty_metadata_is_null(): void
    {
        $actor = User::factory()->admin()->create();
        $request = Request::create('/api/v1/admin/dentists', 'POST');
        $request->setUserResolver(fn () => $actor);
        $request->headers->set('User-Agent', 'Feature Integration Agent');
        $request->server->set('REMOTE_ADDR', '10.20.30.40');

        $logger = app(AuditLogger::class);
        $entry = $logger->logFromRequest(
            request: $request,
            eventType: 'admin.dentist.created',
            entityType: 'user',
            entityId: (string) $actor->id,
        );

        $this->assertDatabaseHas('audit_logs', [
            'id' => $entry->id,
            'actor_id' => $actor->id,
            'dentist_id' => null,
            'actor_role' => User::ROLE_ADMIN,
            'event_type' => 'admin.dentist.created',
            'entity_type' => 'user',
            'entity_id' => (string) $actor->id,
            'ip_address' => '10.20.30.40',
            'user_agent' => 'Feature Integration Agent',
        ]);

        $this->assertNull($entry->metadata);
    }

    public function test_log_redacts_sensitive_metadata_keys(): void
    {
        $actor = User::factory()->create([
            'role' => User::ROLE_DENTIST,
        ]);

        $logger = app(AuditLogger::class);
        $entry = $logger->log(
            actor: $actor,
            eventType: 'auth.password_reset',
            metadata: [
                'email' => 'user@example.com',
                'new_password' => 'plain-secret',
                'session_cookie' => 'cookie-value',
                'nested' => [
                    'api_token' => 'nested-secret',
                    'note' => 'keep-me',
                ],
            ],
        );

        $this->assertSame('user@example.com', $entry->metadata['email']);
        $this->assertSame('[REDACTED]', $entry->metadata['new_password']);
        $this->assertSame('[REDACTED]', $entry->metadata['session_cookie']);
        $this->assertSame('[REDACTED]', $entry->metadata['nested']['api_token']);
        $this->assertSame('keep-me', $entry->metadata['nested']['note']);
    }

    public function test_log_uses_owner_dentist_id_for_assistant_actor(): void
    {
        $dentist = User::factory()->create([
            'role' => User::ROLE_DENTIST,
        ]);
        $assistant = User::factory()->assistant($dentist)->create();

        $logger = app(AuditLogger::class);
        $entry = $logger->log(
            actor: $assistant,
            eventType: 'patient.updated',
            entityType: 'patient',
            entityId: 'patient-1',
        );

        $this->assertDatabaseHas('audit_logs', [
            'id' => $entry->id,
            'actor_id' => $assistant->id,
            'dentist_id' => $dentist->id,
            'actor_role' => User::ROLE_ASSISTANT,
            'event_type' => 'patient.updated',
            'entity_type' => 'patient',
            'entity_id' => 'patient-1',
        ]);
    }
}
