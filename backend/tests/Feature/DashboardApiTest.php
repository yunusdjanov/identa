<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_dashboard_uses_patient_level_outstanding_balance(): void
    {
        $dentist = User::factory()->create();
        $firstPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);
        $secondPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);

        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $firstPatient->id,
            'treatment_date' => now()->startOfMonth()->addDay()->toDateString(),
            'debt_amount' => '500.00',
            'paid_amount' => '0.00',
        ]);
        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $firstPatient->id,
            'treatment_date' => now()->startOfMonth()->addDays(2)->toDateString(),
            'debt_amount' => '0.00',
            'paid_amount' => '280.00',
        ]);
        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $secondPatient->id,
            'treatment_date' => now()->startOfMonth()->addDays(3)->toDateString(),
            'debt_amount' => '600.00',
            'paid_amount' => '0.00',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/dashboard/snapshot')
            ->assertOk()
            ->assertJsonPath('data.revenueThisMonth', 280)
            ->assertJsonPath('data.outstandingDebtTotal', 820);
    }
}
