<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
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
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [
                User::PERMISSION_PATIENTS_VIEW,
                User::PERMISSION_PATIENTS_MANAGE,
            ],
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

    public function test_dentist_cannot_download_other_tenant_odontogram_image(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $foreignPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);
        $foreignEntry = OdontogramEntry::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $foreignPatient->id,
        ]);
        $foreignImage = OdontogramEntryImage::query()->create([
            'dentist_id' => $otherDentist->id,
            'odontogram_entry_id' => $foreignEntry->id,
            'stage' => 'before',
            'disk' => 'local',
            'path' => 'approved/foreign-odontogram.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 1234,
            'scan_status' => 'approved',
        ]);

        $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$foreignPatient->id}/odontogram/{$foreignEntry->id}/images/{$foreignImage->id}")
            ->assertNotFound();
    }

    public function test_invoice_update_cannot_switch_to_other_tenant_patient(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $invoice = Invoice::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'total_amount' => 100000,
            'paid_amount' => 0,
            'balance' => 100000,
        ]);
        $otherDentist = User::factory()->create();
        $foreignPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/invoices/{$invoice->id}", [
                'patient_id' => $foreignPatient->id,
                'invoice_date' => '2026-05-05',
                'items' => [
                    ['description' => 'Cross tenant switch', 'quantity' => 1, 'unit_price' => 100000],
                ],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['patient_id']);
    }
}
