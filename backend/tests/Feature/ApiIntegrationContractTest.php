<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiIntegrationContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_api_flow_enforces_auth_tenancy_and_financial_invariants(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $patientPhone = '+19998887776';

        $this->getJson('/api/v1/patients')->assertUnauthorized();

        $patientResponse = $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/patients', [
                'full_name' => 'Flow Contract Patient',
                'phone' => $patientPhone,
            ])
            ->assertCreated();

        $patientId = $patientResponse->json('data.id');
        $this->assertIsString($patientId);

        $invoiceResponse = $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/invoices', [
                'patient_id' => $patientId,
                'invoice_date' => '2026-03-01',
                'items' => [
                    [
                        'description' => 'Consultation',
                        'quantity' => 1,
                        'unit_price' => 120,
                    ],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.total_amount', 120)
            ->assertJsonPath('data.balance', 120)
            ->assertJsonPath('data.status', Invoice::STATUS_UNPAID);

        $invoiceId = $invoiceResponse->json('data.id');
        $this->assertIsString($invoiceId);

        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);
        $otherInvoice = Invoice::create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
            'invoice_number' => 'INV-INTEGRATION-OTHER',
            'invoice_date' => '2026-03-01',
            'total_amount' => '200.00',
            'paid_amount' => '0.00',
            'balance' => '200.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments', [
                'invoice_id' => $otherInvoice->id,
                'amount' => 50,
                'payment_method' => 'cash',
                'payment_date' => '2026-03-02',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['invoice_id']);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments', [
                'invoice_id' => $invoiceId,
                'amount' => 40,
                'payment_method' => 'card',
                'payment_date' => '2026-03-02',
            ])
            ->assertCreated()
            ->assertJsonPath('data.invoice_id', $invoiceId)
            ->assertJsonPath('data.amount', 40);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/invoices/{$invoiceId}")
            ->assertOk()
            ->assertJsonPath('data.paid_amount', 40)
            ->assertJsonPath('data.balance', 80)
            ->assertJsonPath('data.status', Invoice::STATUS_PARTIALLY_PAID);

    }

    public function test_patient_collection_contract_applies_pagination_filter_and_sort_rules(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();

        Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Spec Alpha',
            'phone' => '+15550000001',
        ]);
        Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Spec Bravo',
            'phone' => '+15550000002',
        ]);
        Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Spec Charlie',
            'phone' => '+15550000003',
        ]);
        Patient::factory()->create([
            'dentist_id' => $otherDentist->id,
            'full_name' => 'Spec External',
            'phone' => '+15550000999',
        ]);

        $response = $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients?per_page=500&sort=full_name&filter[search]=Spec')
            ->assertOk()
            ->assertJsonPath('meta.pagination.per_page', 100)
            ->assertJsonPath('meta.pagination.total', 3);

        $names = collect($response->json('data'))
            ->pluck('full_name')
            ->all();

        $this->assertSame(['Spec Alpha', 'Spec Bravo', 'Spec Charlie'], $names);
    }
}
