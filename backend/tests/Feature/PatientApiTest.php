<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\OdontogramEntry;
use App\Models\Patient;
use App\Models\PatientCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PatientApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_create_patient(): void
    {
        $dentist = User::factory()->create();
        $category = PatientCategory::factory()->create([
            'dentist_id' => $dentist->id,
            'name' => 'VIP',
            'sort_order' => 1,
        ]);

        $response = $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/patients', [
                'full_name' => 'John Doe',
                'phone' => '+15551234567',
                'secondary_phone' => '+15557654321',
                'category_id' => $category->id,
                'address' => '1 Main St',
                'date_of_birth' => '1990-01-01',
                'gender' => 'male',
                'medical_history' => 'None',
                'allergies' => 'None',
                'current_medications' => 'None',
            ])
            ->assertCreated()
            ->assertJsonPath('data.full_name', 'John Doe')
            ->assertJsonPath('data.phone', '+15551234567')
            ->assertJsonPath('data.secondary_phone', '+15557654321')
            ->assertJsonPath('data.last_visit_at', null)
            ->assertJsonPath('data.categories.0.id', $category->id)
            ->assertJsonPath('data.categories.0.name', 'VIP')
            ->assertJsonStructure([
                'data' => [
                    'id',
                    'patient_id',
                    'full_name',
                    'phone',
                    'secondary_phone',
                    'categories',
                ],
            ]);

        $patientCode = $response->json('data.patient_id');
        $this->assertIsString($patientCode);
        $this->assertMatchesRegularExpression('/^PT-\d{4}[A-Z]{2}$/', $patientCode);

        $this->assertDatabaseHas('patients', [
            'dentist_id' => $dentist->id,
            'full_name' => 'John Doe',
        ]);
        $this->assertDatabaseHas('patient_category_patient', [
            'patient_id' => $response->json('data.id'),
            'patient_category_id' => $category->id,
        ]);
    }

    public function test_dentist_can_list_only_owned_patients(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();

        $ownedPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Owned Patient',
        ]);
        Patient::factory()->create([
            'dentist_id' => $otherDentist->id,
            'full_name' => 'Other Patient',
        ]);
        Appointment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $ownedPatient->id,
            'appointment_date' => '2026-01-15',
            'status' => Appointment::STATUS_COMPLETED,
        ]);
        OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $ownedPatient->id,
            'condition_date' => '2026-01-20',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.full_name', 'Owned Patient')
            ->assertJsonPath('data.0.last_visit_at', '2026-01-20');
    }

    public function test_patient_create_validates_name_phone_and_optional_text_lengths(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/patients', [
                'full_name' => 'Al',
                'phone' => '12345',
                'secondary_phone' => '+12',
                'address' => 'ab',
                'medical_history' => str_repeat('a', 2001),
                'allergies' => str_repeat('b', 256),
                'current_medications' => str_repeat('c', 256),
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'full_name',
                'phone',
                'secondary_phone',
                'address',
                'medical_history',
                'allergies',
                'current_medications',
            ]);
    }

    public function test_dentist_can_show_update_and_delete_owned_patient(): void
    {
        $dentist = User::factory()->create();
        $firstCategory = PatientCategory::factory()->create([
            'dentist_id' => $dentist->id,
            'name' => 'First',
            'sort_order' => 1,
        ]);
        $secondCategory = PatientCategory::factory()->create([
            'dentist_id' => $dentist->id,
            'name' => 'Second',
            'sort_order' => 2,
        ]);
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Before Name',
            'phone' => '+15550000000',
        ]);
        $patient->categories()->sync([$firstCategory->id]);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}")
            ->assertOk()
            ->assertJsonPath('data.full_name', 'Before Name')
            ->assertJsonPath('data.categories.0.id', $firstCategory->id);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/patients/{$patient->id}", [
                'full_name' => 'After Name',
                'phone' => '+15551112222',
                'secondary_phone' => '+15553334444',
                'category_id' => $secondCategory->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.full_name', 'After Name')
            ->assertJsonPath('data.phone', '+15551112222')
            ->assertJsonPath('data.secondary_phone', '+15553334444')
            ->assertJsonPath('data.categories.0.id', $secondCategory->id);

        $this->assertDatabaseHas('patient_category_patient', [
            'patient_id' => $patient->id,
            'patient_category_id' => $secondCategory->id,
        ]);
        $this->assertDatabaseMissing('patient_category_patient', [
            'patient_id' => $patient->id,
            'patient_category_id' => $firstCategory->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}")
            ->assertNoContent();

        $this->assertSoftDeleted('patients', [
            'id' => $patient->id,
        ]);
    }

    public function test_dentist_can_restore_archived_patient(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}")
            ->assertNoContent();

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/restore")
            ->assertOk()
            ->assertJsonPath('data.id', $patient->id)
            ->assertJsonPath('data.is_archived', false);

        $this->assertDatabaseHas('patients', [
            'id' => $patient->id,
            'deleted_at' => null,
        ]);
    }

    public function test_dentist_can_force_delete_archived_patient_without_related_records(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}")
            ->assertNoContent();

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}/force")
            ->assertNoContent();

        $this->assertDatabaseMissing('patients', [
            'id' => $patient->id,
        ]);
    }

    public function test_dentist_cannot_force_delete_patient_with_related_records(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);
        Appointment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}")
            ->assertNoContent();

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}/force")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['patient']);
    }

    public function test_dentist_cannot_access_other_dentist_patient_records(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $otherPatient = Patient::factory()->create([
            'dentist_id' => $otherDentist->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$otherPatient->id}")
            ->assertNotFound();

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/patients/{$otherPatient->id}", [
                'full_name' => 'Blocked',
                'phone' => '+15559999999',
            ])
            ->assertNotFound();

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$otherPatient->id}")
            ->assertNotFound();
    }

    public function test_dentist_can_filter_patients_by_category(): void
    {
        $dentist = User::factory()->create();
        $vipCategory = PatientCategory::factory()->create([
            'dentist_id' => $dentist->id,
            'name' => 'VIP',
        ]);
        $regularCategory = PatientCategory::factory()->create([
            'dentist_id' => $dentist->id,
            'name' => 'Regular',
        ]);

        $vipPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'VIP Patient',
        ]);
        $regularPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Regular Patient',
        ]);
        $uncategorizedPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Uncategorized Patient',
        ]);

        $vipPatient->categories()->sync([$vipCategory->id]);
        $regularPatient->categories()->sync([$regularCategory->id]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients?filter[category_id]='.urlencode($vipCategory->id))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.full_name', 'VIP Patient');

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients?filter[category_ids]='.urlencode($regularCategory->id))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.full_name', 'Regular Patient');

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 3)
            ->assertJsonFragment(['full_name' => 'Uncategorized Patient']);
    }

    public function test_dentist_can_search_patient_by_secondary_phone(): void
    {
        $dentist = User::factory()->create();
        Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Primary Only',
            'phone' => '+15550000011',
            'secondary_phone' => null,
        ]);
        Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Has Secondary',
            'phone' => '+15550000022',
            'secondary_phone' => '+15559998888',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients?filter[search]=998888')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.full_name', 'Has Secondary')
            ->assertJsonPath('data.0.secondary_phone', '+15559998888');
    }

    public function test_dentist_search_does_not_match_patient_id(): void
    {
        $dentist = User::factory()->create();
        Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => 'PT-9999AA',
            'full_name' => 'Search Name',
            'phone' => '+15550000031',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients?filter[search]=9999')
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('meta.pagination.total', 0);
    }

    public function test_dentist_can_upload_and_delete_patient_photo(): void
    {
        Storage::fake('local');
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/photo", [
                'photo' => UploadedFile::fake()->image('avatar.jpg', 300, 300),
            ])
            ->assertOk()
            ->assertJsonPath('data.id', (string) $patient->id)
            ->assertJsonPath('data.photo_url', fn ($value): bool => is_string($value) && $value !== '')
            ->assertJsonPath('data.photo_thumbnail_url', fn ($value): bool => is_string($value) && str_contains($value, 'variant=thumbnail'))
            ->assertJsonPath('data.photo_preview_url', fn ($value): bool => is_string($value) && str_contains($value, 'variant=preview'));

        $downloadResponse = $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/photo");
        $downloadResponse->assertOk();
        $this->assertStringContainsString('image/', (string) $downloadResponse->headers->get('Content-Type'));
        $this->assertSame('private, max-age=300', (string) $downloadResponse->headers->get('Cache-Control'));

        $thumbnailResponse = $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/photo?variant=thumbnail");
        $thumbnailResponse->assertOk();
        $this->assertStringContainsString('image/', (string) $thumbnailResponse->headers->get('Content-Type'));

        $previewResponse = $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/photo?variant=preview");
        $previewResponse->assertOk();
        $this->assertStringContainsString('image/', (string) $previewResponse->headers->get('Content-Type'));

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}/photo")
            ->assertOk()
            ->assertJsonPath('data.id', (string) $patient->id)
            ->assertJsonPath('data.photo_url', null)
            ->assertJsonPath('data.photo_thumbnail_url', null)
            ->assertJsonPath('data.photo_preview_url', null);
    }

    public function test_dentist_can_filter_inactive_patients_by_last_visit_threshold(): void
    {
        $dentist = User::factory()->create();

        $noVisitPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'No Visit Patient',
        ]);
        $inactivePatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Inactive Patient',
        ]);
        $activePatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Active Patient',
        ]);
        $inactiveOdontogramPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Inactive Odontogram Patient',
        ]);
        $activeOdontogramPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Active Odontogram Patient',
        ]);

        Appointment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $inactivePatient->id,
            'appointment_date' => '2025-06-10',
            'status' => Appointment::STATUS_COMPLETED,
        ]);
        Appointment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $activePatient->id,
            'appointment_date' => '2026-01-10',
            'status' => Appointment::STATUS_COMPLETED,
        ]);
        OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $inactiveOdontogramPatient->id,
            'condition_date' => '2025-07-01',
        ]);
        OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $activeOdontogramPatient->id,
            'condition_date' => '2025-10-01',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients?filter[inactive_before]=2025-09-01')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 3)
            ->assertJsonFragment(['full_name' => $noVisitPatient->full_name])
            ->assertJsonFragment(['full_name' => $inactivePatient->full_name])
            ->assertJsonFragment(['full_name' => $inactiveOdontogramPatient->full_name])
            ->assertJsonMissing(['full_name' => $activePatient->full_name])
            ->assertJsonMissing(['full_name' => $activeOdontogramPatient->full_name]);
    }

    public function test_guest_is_unauthorized_for_patients_routes(): void
    {
        $this->getJson('/api/v1/patients')->assertUnauthorized();
    }

    public function test_admin_is_forbidden_for_dentist_patients_routes(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin, 'web')
            ->getJson('/api/v1/patients')
            ->assertForbidden();
    }
}
