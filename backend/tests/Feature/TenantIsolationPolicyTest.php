<?php

namespace Tests\Feature;

use App\Contracts\TenantOwned;
use App\Models\Appointment;
use App\Models\Invoice;
use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class TenantIsolationPolicyTest extends TestCase
{
    use RefreshDatabase;

    public function test_tenant_owned_model_resolves_dentist_and_assistant_ownership(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create();
        $otherDentist = User::factory()->create();
        $admin = User::factory()->admin()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->assertInstanceOf(TenantOwned::class, $patient);
        $this->assertSame((int) $dentist->id, $patient->tenantId());
        $this->assertTrue($patient->belongsToTenant($dentist));
        $this->assertTrue($patient->belongsToTenant($assistant));
        $this->assertFalse($patient->belongsToTenant($otherDentist));
        $this->assertFalse($patient->belongsToTenant($admin));
    }

    public function test_patient_policy_allows_only_same_tenant_app_users(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create([
            'assistant_permissions' => [User::PERMISSION_PATIENTS_VIEW],
        ]);
        $otherDentist = User::factory()->create();
        $admin = User::factory()->admin()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->assertTrue(Gate::forUser($dentist)->allows('view', $patient));
        $this->assertTrue(Gate::forUser($assistant)->allows('view', $patient));
        $this->assertFalse(Gate::forUser($otherDentist)->allows('view', $patient));
        $this->assertFalse(Gate::forUser($admin)->allows('view', $patient));
    }

    public function test_for_tenant_scope_uses_assistant_owner_tenant(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->assistant($dentist)->create();
        $ownedPatient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        Patient::factory()->create();

        $visiblePatients = Patient::query()
            ->forTenant($assistant)
            ->pluck('id')
            ->all();

        $this->assertSame([$ownedPatient->id], $visiblePatients);
    }

    public function test_patient_nested_relationships_keep_same_tenant_boundary(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $ownedTreatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        Treatment::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $patient->id,
        ]);

        $ownedAppointment = Appointment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        Appointment::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $patient->id,
        ]);

        $ownedInvoice = Invoice::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        Invoice::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $patient->id,
        ]);

        $ownedPayment = Payment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_id' => $ownedInvoice->id,
        ]);
        Payment::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $patient->id,
        ]);

        $ownedEntry = OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        OdontogramEntry::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $patient->id,
        ]);

        $this->assertSame([$ownedTreatment->id], $patient->treatments()->pluck('id')->all());
        $this->assertSame([$ownedAppointment->id], $patient->appointments()->pluck('id')->all());
        $this->assertSame([$ownedInvoice->id], $patient->invoices()->pluck('id')->all());
        $this->assertSame([$ownedPayment->id], $patient->payments()->pluck('id')->all());
        $this->assertSame([$ownedEntry->id], $patient->odontogramEntries()->pluck('id')->all());
    }

    public function test_image_nested_relationships_keep_same_tenant_boundary(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $ownedTreatmentImage = TreatmentImage::query()->create([
            'dentist_id' => $dentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => 'approved/owned-treatment.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'approved',
        ]);
        TreatmentImage::query()->create([
            'dentist_id' => $otherDentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => 'approved/foreign-treatment.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'approved',
        ]);

        $entry = OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $ownedEntryImage = OdontogramEntryImage::query()->create([
            'dentist_id' => $dentist->id,
            'odontogram_entry_id' => $entry->id,
            'stage' => 'before',
            'disk' => 'local',
            'path' => 'approved/owned-odontogram.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'approved',
        ]);
        OdontogramEntryImage::query()->create([
            'dentist_id' => $otherDentist->id,
            'odontogram_entry_id' => $entry->id,
            'stage' => 'after',
            'disk' => 'local',
            'path' => 'approved/foreign-odontogram.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'approved',
        ]);

        $this->assertSame([$ownedTreatmentImage->id], $treatment->images()->pluck('id')->all());
        $this->assertSame($ownedTreatmentImage->id, $treatment->primaryImage()->value('id'));
        $this->assertSame([$ownedEntryImage->id], $entry->images()->pluck('id')->all());
    }
}
