<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AssistantTenantAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_assistant_with_patients_view_permission_sees_only_owner_dentist_patients(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [User::PERMISSION_PATIENTS_VIEW],
        ]);

        Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Owned Patient',
        ]);
        Patient::factory()->create([
            'dentist_id' => $otherDentist->id,
            'full_name' => 'Other Dentist Patient',
        ]);

        $this->actingAs($assistant, 'web')
            ->getJson('/api/v1/patients')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.full_name', 'Owned Patient');
    }

    public function test_assistant_without_patients_permission_is_forbidden(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [],
        ]);

        $this->actingAs($assistant, 'web')
            ->getJson('/api/v1/patients')
            ->assertForbidden();
    }

    public function test_assistant_with_patients_manage_permission_creates_patient_for_owner_dentist(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [User::PERMISSION_PATIENTS_MANAGE],
        ]);

        $response = $this->actingAs($assistant, 'web')
            ->postJson('/api/v1/patients', [
                'full_name' => 'Created By Assistant',
                'phone' => '+998901234567',
            ])
            ->assertCreated()
            ->assertJsonPath('data.full_name', 'Created By Assistant');

        $this->assertDatabaseHas('patients', [
            'id' => $response->json('data.id'),
            'dentist_id' => $dentist->id,
            'full_name' => 'Created By Assistant',
        ]);
    }
}
