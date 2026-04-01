<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppointmentApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_create_appointment_for_owned_patient(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);
        $appointmentDate = now()->addDay()->toDateString();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'patient_id' => $patient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '10:00',
                'end_time' => '10:30',
                'status' => Appointment::STATUS_SCHEDULED,
                'reason' => 'Initial checkup',
            ])
            ->assertCreated()
            ->assertJsonPath('data.patient_id', $patient->id)
            ->assertJsonPath('data.patient_name', $patient->full_name)
            ->assertJsonPath('data.status', Appointment::STATUS_SCHEDULED);

        $this->assertTrue(
            Appointment::query()
                ->where('dentist_id', $dentist->id)
                ->where('patient_id', $patient->id)
                ->whereDate('appointment_date', $appointmentDate)
                ->exists()
        );
    }

    public function test_dentist_cannot_create_appointment_for_other_dentist_patient(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $otherPatient = Patient::factory()->create([
            'dentist_id' => $otherDentist->id,
        ]);
        $appointmentDate = now()->addDay()->toDateString();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'patient_id' => $otherPatient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '10:00',
                'end_time' => '10:30',
            ])
            ->assertStatus(422);
    }

    public function test_appointment_create_validates_reason_max_length(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);
        $appointmentDate = now()->addDay()->toDateString();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'patient_id' => $patient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '10:00',
                'end_time' => '10:30',
                'reason' => str_repeat('a', 256),
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['reason']);
    }

    public function test_dentist_cannot_create_overlapping_appointment(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);
        $appointmentDate = now()->addDays(2)->toDateString();

        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => $appointmentDate,
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'patient_id' => $patient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '10:15',
                'end_time' => '10:45',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['start_time'])
            ->assertJsonPath('errors.start_time.0', __('api.appointments.conflict'));
    }

    public function test_dentist_cannot_create_appointment_in_past_slot(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'patient_id' => $patient->id,
                'appointment_date' => now()->subDay()->toDateString(),
                'start_time' => '10:00',
                'end_time' => '10:30',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['start_time'])
            ->assertJsonPath('errors.start_time.0', __('api.appointments.past_slot'));
    }

    public function test_dentist_can_create_appointment_overlapping_no_show_slot(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);
        $appointmentDate = now()->addDays(2)->toDateString();

        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => $appointmentDate,
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => Appointment::STATUS_NO_SHOW,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'patient_id' => $patient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '10:15',
                'end_time' => '10:45',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertCreated();
    }

    public function test_dentist_cannot_move_appointment_to_past_slot(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);

        $appointment = Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => now()->addDay()->toDateString(),
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/appointments/{$appointment->id}", [
                'patient_id' => $patient->id,
                'appointment_date' => now()->subDay()->toDateString(),
                'start_time' => '11:00',
                'end_time' => '11:30',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['start_time'])
            ->assertJsonPath('errors.start_time.0', __('api.appointments.past_slot'));
    }

    public function test_dentist_cannot_move_appointment_into_overlapping_slot(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);
        $appointmentDate = now()->addDays(3)->toDateString();

        $draggedAppointment = Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => $appointmentDate,
            'start_time' => '08:00',
            'end_time' => '08:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);
        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => $appointmentDate,
            'start_time' => '09:00',
            'end_time' => '10:00',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/appointments/{$draggedAppointment->id}", [
                'patient_id' => $patient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '09:30',
                'end_time' => '10:30',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['start_time'])
            ->assertJsonPath('errors.start_time.0', __('api.appointments.conflict'));
    }

    public function test_dentist_can_move_appointment_into_no_show_slot(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);
        $appointmentDate = now()->addDays(3)->toDateString();

        $draggedAppointment = Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => $appointmentDate,
            'start_time' => '08:00',
            'end_time' => '08:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);
        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => $appointmentDate,
            'start_time' => '09:00',
            'end_time' => '10:00',
            'status' => Appointment::STATUS_NO_SHOW,
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/appointments/{$draggedAppointment->id}", [
                'patient_id' => $patient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '09:30',
                'end_time' => '10:30',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertOk()
            ->assertJsonPath('data.start_time', '09:30')
            ->assertJsonPath('data.end_time', '10:30');
    }

    public function test_dentist_can_manage_only_owned_appointments(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);
        $appointmentDate = now()->addDays(2)->toDateString();
        $updatedDate = now()->addDays(3)->toDateString();

        $ownedAppointment = Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => $appointmentDate,
            'start_time' => '11:00',
            'end_time' => '11:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);
        $otherAppointment = Appointment::create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
            'appointment_date' => $appointmentDate,
            'start_time' => '12:00',
            'end_time' => '12:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/appointments')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $ownedAppointment->id)
            ->assertJsonPath('data.0.patient_name', $patient->full_name);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/appointments/{$otherAppointment->id}")
            ->assertNotFound();

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/appointments/{$otherAppointment->id}", [
                'patient_id' => $patient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '13:00',
                'end_time' => '13:30',
            ])
            ->assertNotFound();

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/appointments/{$otherAppointment->id}")
            ->assertNotFound();

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/appointments/{$ownedAppointment->id}", [
                'patient_id' => $patient->id,
                'appointment_date' => $updatedDate,
                'start_time' => '09:00',
                'end_time' => '09:30',
                'status' => Appointment::STATUS_COMPLETED,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', Appointment::STATUS_COMPLETED);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/appointments/{$ownedAppointment->id}")
            ->assertNoContent();
    }

    public function test_guest_is_unauthorized_and_admin_is_forbidden_for_appointments_routes(): void
    {
        $this->getJson('/api/v1/appointments')->assertUnauthorized();

        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web')
            ->getJson('/api/v1/appointments')
            ->assertForbidden();
    }

    public function test_dentist_can_filter_appointments_by_date_range(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Range Patient',
        ]);
        $otherPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Other Range Patient',
        ]);
        $rangeStart = now()->addDays(1);
        $rangeEnd = now()->addDays(7);
        $insideDateA = $rangeStart->copy()->addDay()->toDateString();
        $insideDateB = $rangeStart->copy()->addDays(2)->toDateString();
        $outsideDate = $rangeEnd->copy()->addDays(5)->toDateString();

        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => $insideDateA,
            'start_time' => '09:00',
            'end_time' => '09:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);
        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => $outsideDate,
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);
        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $otherPatient->id,
            'appointment_date' => $insideDateB,
            'start_time' => '11:00',
            'end_time' => '11:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson(
                '/api/v1/appointments?filter[date_from]='.$rangeStart->toDateString()
                .'&filter[date_to]='.$rangeEnd->toDateString()
            )
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 2)
            ->assertJsonFragment(['patient_name' => 'Range Patient'])
            ->assertJsonFragment(['patient_name' => 'Other Range Patient']);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/appointments?filter[patient_id]='.urlencode($patient->id))
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 2)
            ->assertJsonPath('data.0.patient_id', $patient->id)
            ->assertJsonPath('data.1.patient_id', $patient->id);
    }

    public function test_dentist_cannot_edit_finalized_appointments(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);

        $completedAppointment = Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => '2026-03-03',
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => Appointment::STATUS_COMPLETED,
        ]);

        $cancelledAppointment = Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => '2026-03-04',
            'start_time' => '11:00',
            'end_time' => '11:30',
            'status' => Appointment::STATUS_CANCELLED,
        ]);
        $noShowAppointment = Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => '2026-03-05',
            'start_time' => '12:00',
            'end_time' => '12:30',
            'status' => Appointment::STATUS_NO_SHOW,
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/appointments/{$completedAppointment->id}", [
                'patient_id' => $patient->id,
                'appointment_date' => '2026-03-05',
                'start_time' => '09:00',
                'end_time' => '09:30',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status']);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/appointments/{$cancelledAppointment->id}", [
                'patient_id' => $patient->id,
                'appointment_date' => '2026-03-07',
                'start_time' => '13:00',
                'end_time' => '13:30',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status']);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/appointments/{$noShowAppointment->id}", [
                'patient_id' => $patient->id,
                'appointment_date' => '2026-03-08',
                'start_time' => '14:00',
                'end_time' => '14:30',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['status']);
    }
}
