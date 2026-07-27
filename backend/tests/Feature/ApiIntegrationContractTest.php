<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiIntegrationContractTest extends TestCase
{
    use RefreshDatabase;

    public function test_retired_duplicate_financial_and_legacy_routes_are_not_registered(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $requests = [
            ['getJson', '/api/v1/invoices'],
            ['getJson', '/api/v1/payments'],
            ['postJson', "/api/v1/patients/{$patient->id}/quick-payments"],
            ['getJson', "/api/v1/patients/{$patient->id}/odontogram"],
            ['getJson', '/api/v1/dashboard/snapshot'],
            ['getJson', '/api/v1/lookups/appointments'],
            ['getJson', '/api/v1/treatments'],
        ];

        foreach ($requests as [$method, $uri]) {
            $this->actingAs($dentist, 'web')
                ->{$method}($uri)
                ->assertNotFound();
        }
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
