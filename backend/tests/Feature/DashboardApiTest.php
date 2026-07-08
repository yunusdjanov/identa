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

    public function test_dashboard_today_widget_excludes_archived_patient_appointments(): void
    {
        // The dashboard "today" widget must not surface appointments belonging
        // to an archived patient; they would render as "Unknown patient".
        $dentist = User::factory()->create();
        $activePatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Active Patient',
        ]);
        $archivedPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Archived Patient',
        ]);
        $date = '2026-04-24';

        Appointment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $activePatient->id,
            'appointment_date' => $date,
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);
        Appointment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $archivedPatient->id,
            'appointment_date' => $date,
            'start_time' => '11:00',
            'end_time' => '11:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        $archivedPatient->delete();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/dashboard/snapshot?date='.$date)
            ->assertOk()
            ->assertJsonCount(1, 'data.todayAppointments')
            ->assertJsonPath('data.todayAppointments.0.patientName', 'Active Patient');
    }

    public function test_dashboard_today_widget_includes_guest_appointments(): void
    {
        $dentist = User::factory()->create();
        $date = '2026-04-24';

        Appointment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => null,
            'guest_name' => 'Walk In Visitor',
            'guest_phone' => '+998901234567',
            'appointment_date' => $date,
            'start_time' => '12:00',
            'end_time' => '12:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/dashboard/snapshot?date='.$date)
            ->assertOk()
            ->assertJsonCount(1, 'data.todayAppointments')
            ->assertJsonPath('data.todayAppointments.0.patientName', 'Walk In Visitor');
    }
}
