<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\PatientCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PatientCategoryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_crud_own_patient_categories(): void
    {
        $dentist = User::factory()->create();

        $createResponse = $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/patient-categories', [
                'name' => 'VIP',
                'color' => '#3B82F6',
                'sort_order' => 1,
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'VIP')
            ->assertJsonPath('data.color', '#3B82F6')
            ->assertJsonPath('data.sort_order', 1);

        $categoryId = $createResponse->json('data.id');
        $this->assertIsString($categoryId);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patient-categories')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $categoryId);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/patient-categories/{$categoryId}", [
                'name' => 'High Priority',
                'color' => '#10B981',
                'sort_order' => 2,
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'High Priority')
            ->assertJsonPath('data.color', '#10B981')
            ->assertJsonPath('data.sort_order', 2);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patient-categories/{$categoryId}")
            ->assertNoContent();

        $this->assertDatabaseMissing('patient_categories', [
            'id' => $categoryId,
        ]);
    }

    public function test_dentist_cannot_manage_other_dentist_category(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();

        $otherCategory = PatientCategory::factory()->create([
            'dentist_id' => $otherDentist->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/patient-categories/{$otherCategory->id}", [
                'name' => 'Blocked',
                'color' => '#EF4444',
                'sort_order' => 1,
            ])
            ->assertNotFound();

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patient-categories/{$otherCategory->id}")
            ->assertNotFound();
    }

    public function test_patient_category_validates_name_length_constraints(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/patient-categories', [
                'name' => 'AB',
                'color' => '#3B82F6',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/patient-categories', [
                'name' => str_repeat('a', 101),
                'color' => '#3B82F6',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name']);
    }

    public function test_deleting_category_detaches_it_from_patients(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $category = PatientCategory::factory()->create(['dentist_id' => $dentist->id]);

        $patient->categories()->sync([$category->id]);
        $this->assertDatabaseHas('patient_category_patient', [
            'patient_id' => $patient->id,
            'patient_category_id' => $category->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patient-categories/{$category->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('patient_category_patient', [
            'patient_id' => $patient->id,
            'patient_category_id' => $category->id,
        ]);
    }

    public function test_guest_is_unauthorized_and_admin_forbidden_for_patient_category_routes(): void
    {
        $this->getJson('/api/v1/patient-categories')->assertUnauthorized();

        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web')
            ->getJson('/api/v1/patient-categories')
            ->assertForbidden();
    }
}
