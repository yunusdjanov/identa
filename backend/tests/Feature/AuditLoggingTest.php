<?php

namespace Tests\Feature;

use App\Models\Invoice;
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

    public function test_patient_and_payment_events_are_recorded(): void
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

        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patientId,
            'invoice_number' => 'INV-AUDIT-1',
            'invoice_date' => '2026-03-01',
            'total_amount' => '200.00',
            'paid_amount' => '0.00',
            'balance' => '200.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        $paymentResponse = $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments', [
                'invoice_id' => $invoice->id,
                'amount' => 50,
                'payment_method' => 'cash',
                'payment_date' => '2026-03-02',
            ])
            ->assertCreated();

        $paymentId = $paymentResponse->json('data.id');

        $this->assertDatabaseHas('audit_logs', [
            'event_type' => 'payment.created',
            'actor_id' => $dentist->id,
            'entity_type' => 'payment',
            'entity_id' => $paymentId,
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
