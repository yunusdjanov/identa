<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditLoggingTest extends TestCase
{
    use RefreshDatabase;

    public function test_auth_login_event_is_recorded(): void
    {
        $user = User::factory()->create([
            'email' => 'audit-login@example.com',
            'password' => 'password123',
        ]);

        $this->postJson('/api/v1/auth/login', [
            'email' => 'audit-login@example.com',
            'password' => 'password123',
        ], $this->csrfHeaders())->assertOk();

        $this->assertDatabaseHas('audit_logs', [
            'event_type' => 'auth.login',
            'actor_id' => $user->id,
            'entity_type' => 'user',
            'entity_id' => (string) $user->id,
        ]);
    }

    public function test_patient_event_is_recorded(): void
    {
        $dentist = User::factory()->create();

        $patientResponse = $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/patients', [
                'full_name' => 'Audit Patient',
                'phone' => '+15550001234',
            ])
            ->assertCreated();

        $patientId = $patientResponse->json('data.id');

        $this->assertDatabaseHas('audit_logs', [
            'event_type' => 'patient.created',
            'actor_id' => $dentist->id,
            'entity_type' => 'patient',
            'entity_id' => $patientId,
        ]);
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
