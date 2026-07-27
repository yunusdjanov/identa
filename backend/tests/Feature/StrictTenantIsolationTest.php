<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StrictTenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    public function test_assistant_cannot_show_or_update_another_tenant_patient_by_direct_id(): void
    {
        $dentist = User::factory()->create();
        // must_change_password defaults to true on the assistant factory state
        // (forced password rotation on first login). EnsurePasswordRotated
        // 403s mutation routes while the flag is set, which would mask the
        // 404 we're actually asserting on the cross-tenant PUT below.
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [
                User::PERMISSION_PATIENTS_VIEW,
                User::PERMISSION_PATIENTS_MANAGE,
            ],
            'must_change_password' => false,
        ]);
        $otherDentist = User::factory()->create();
        $foreignPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);

        $this->actingAs($assistant, 'web')
            ->getJson("/api/v1/patients/{$foreignPatient->id}")
            ->assertNotFound();

        $this->actingAs($assistant, 'web')
            ->putJson("/api/v1/patients/{$foreignPatient->id}", [
                'full_name' => 'Updated Foreign Patient',
                'phone' => '+998901112233',
            ])
            ->assertNotFound();
    }

    public function test_dentist_cannot_download_other_tenant_treatment_image(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $foreignPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);
        $foreignTreatment = Treatment::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $foreignPatient->id,
        ]);
        $foreignImage = TreatmentImage::query()->create([
            'dentist_id' => $otherDentist->id,
            'treatment_id' => $foreignTreatment->id,
            'disk' => 'local',
            'path' => 'approved/foreign-treatment.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 1234,
            'scan_status' => 'approved',
        ]);

        $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$foreignPatient->id}/treatments/{$foreignTreatment->id}/images/{$foreignImage->id}")
            ->assertNotFound();
    }

}
