<?php

namespace Tests\Unit;

use App\Models\Patient;
use App\Models\User;
use App\Services\PatientIdentityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PatientIdentityServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_patient_identity_creation_uses_the_tenant_code_contract(): void
    {
        $dentist = User::factory()->create();
        $service = app(PatientIdentityService::class);
        $attributes = [
            'full_name' => 'Identity Patient',
            'phone' => '+998901234567',
            'created_by_user_id' => $dentist->id,
            'updated_by_user_id' => $dentist->id,
        ];

        $patient = DB::transaction(fn (): Patient => $service->create($dentist->id, $attributes));

        $this->assertMatchesRegularExpression('/^PT-\d{4}[A-Z]{2}$/', $patient->patient_id);
        $this->assertDatabaseHas('patients', [
            'id' => $patient->id,
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->patient_id,
        ]);
    }
}
