<?php

namespace Tests\Feature;

use App\Models\Appointment;
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

    public function test_dashboard_snapshot_uses_requested_local_date_in_cache_key(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);

        Appointment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => '2026-04-24',
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        foreach ([
            ['10:00', '10:30'],
            ['12:00', '12:30'],
            ['15:00', '15:30'],
            ['18:00', '18:30'],
        ] as [$startTime, $endTime]) {
            Appointment::factory()->create([
                'dentist_id' => $dentist->id,
                'patient_id' => $patient->id,
                'appointment_date' => '2026-04-25',
                'start_time' => $startTime,
                'end_time' => $endTime,
                'status' => Appointment::STATUS_SCHEDULED,
            ]);
        }

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/dashboard/snapshot?date=2026-04-24')
            ->assertOk()
            ->assertJsonCount(1, 'data.todayAppointments');

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/dashboard/snapshot?date=2026-04-25')
            ->assertOk()
            ->assertJsonCount(4, 'data.todayAppointments');
    }
}
