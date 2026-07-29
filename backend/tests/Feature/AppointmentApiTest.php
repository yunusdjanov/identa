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

    public function test_appointment_configuration_uses_tenant_dentist_schedule_for_staff(): void
    {
        $dentist = User::factory()->create([
            'working_hours_start' => '08:30',
            'working_hours_end' => '18:15',
            'default_appointment_duration' => 45,
        ]);
        $assistant = User::factory()->create([
            'role' => User::ROLE_ASSISTANT,
            'dentist_owner_id' => $dentist->id,
            'assistant_permissions' => [User::PERMISSION_APPOINTMENTS_VIEW],
            'working_hours_start' => '12:00',
            'working_hours_end' => '13:00',
            'default_appointment_duration' => 15,
        ]);

        $this->actingAs($assistant, 'web')
            ->getJson('/api/v1/appointments/configuration')
            ->assertOk()
            ->assertExactJson([
                'data' => [
                    'working_hours' => [
                        'start' => '08:30',
                        'end' => '18:15',
                    ],
                    'default_appointment_duration' => 45,
                ],
            ]);
    }

    public function test_appointment_configuration_requires_view_permission(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->create([
            'role' => User::ROLE_ASSISTANT,
            'dentist_owner_id' => $dentist->id,
            'assistant_permissions' => [],
        ]);

        $this->actingAs($assistant, 'web')
            ->getJson('/api/v1/appointments/configuration')
            ->assertForbidden();
    }

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
            ->assertJsonPath('data.created_by.id', (string) $dentist->id)
            ->assertJsonPath('data.updated_by.id', (string) $dentist->id)
            ->assertJsonPath('data.status', Appointment::STATUS_SCHEDULED);

        $this->assertTrue(
            Appointment::query()
                ->where('dentist_id', $dentist->id)
                ->where('patient_id', $patient->id)
                ->where('created_by_user_id', $dentist->id)
                ->where('updated_by_user_id', $dentist->id)
                ->whereDate('appointment_date', $appointmentDate)
                ->exists()
        );
    }

    public function test_dentist_can_create_guest_appointment_without_patient_record(): void
    {
        $dentist = User::factory()->create();
        $appointmentDate = now()->addDay()->toDateString();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'guest_name' => 'New Visitor',
                'guest_phone' => '+998901234567',
                'appointment_date' => $appointmentDate,
                'start_time' => '10:00',
                'end_time' => '10:30',
                'status' => Appointment::STATUS_SCHEDULED,
                'reason' => 'Consultation',
            ])
            ->assertCreated()
            ->assertJsonPath('data.patient_id', null)
            ->assertJsonPath('data.patient_name', 'New Visitor')
            ->assertJsonPath('data.guest_name', 'New Visitor')
            ->assertJsonPath('data.guest_phone', '+998901234567')
            ->assertJsonPath('data.is_guest', true);

        $this->assertTrue(
            Appointment::query()
                ->where('dentist_id', $dentist->id)
                ->whereNull('patient_id')
                ->where('guest_name', 'New Visitor')
                ->where('guest_phone', '+998901234567')
                ->whereDate('appointment_date', $appointmentDate)
                ->exists()
        );
    }

    public function test_guest_appointment_appears_in_the_calendar_list(): void
    {
        $dentist = User::factory()->create();
        $appointmentDate = now()->addDay()->toDateString();

        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => null,
            'guest_name' => 'Walk In Visitor',
            'guest_phone' => '+998901234567',
            'appointment_date' => $appointmentDate,
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/appointments')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 1)
            ->assertJsonPath('data.0.patient_name', 'Walk In Visitor')
            ->assertJsonPath('data.0.is_guest', true);
    }

    public function test_guest_appointment_blocks_its_scheduled_slot(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $appointmentDate = now()->addDay()->toDateString();

        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => null,
            'guest_name' => 'Walk In Visitor',
            'guest_phone' => '+998901234567',
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
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['start_time']);
    }

    public function test_dentist_can_create_patient_card_from_guest_appointment_with_corrected_identity(): void
    {
        $dentist = User::factory()->create();
        $appointment = Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => null,
            'guest_name' => 'Jamal Hasanov',
            'guest_phone' => '+998901111111',
            'appointment_date' => now()->addDay()->toDateString(),
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => Appointment::STATUS_SCHEDULED,
            'notes' => 'Consultation',
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/appointments/{$appointment->id}/patient-card", [
                'full_name' => 'Jamol Hasanov',
                'phone' => '+998902222222',
                'medical_history' => 'No known conditions',
            ])
            ->assertCreated()
            ->assertJsonPath('data.patient.full_name', 'Jamol Hasanov')
            ->assertJsonPath('data.patient.phone', '+998902222222')
            ->assertJsonPath('data.appointment.guest_name', null)
            ->assertJsonPath('data.appointment.guest_phone', null)
            ->assertJsonPath('data.appointment.is_guest', false);

        $createdPatient = Patient::query()
            ->where('dentist_id', $dentist->id)
            ->where('full_name', 'Jamol Hasanov')
            ->where('phone', '+998902222222')
            ->firstOrFail();

        $this->assertDatabaseHas('appointments', [
            'id' => $appointment->id,
            'patient_id' => $createdPatient->id,
            'guest_name' => null,
            'guest_phone' => null,
            'updated_by_user_id' => $dentist->id,
        ]);
    }

    public function test_patient_card_creation_does_not_duplicate_already_linked_appointment(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);
        $appointment = Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => now()->addDay()->toDateString(),
            'start_time' => '11:00',
            'end_time' => '11:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        $patientsBefore = Patient::query()->count();

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/appointments/{$appointment->id}/patient-card", [
                'full_name' => 'Duplicate Candidate',
                'phone' => '+998903333333',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['appointment']);

        $this->assertSame($patientsBefore, Patient::query()->count());
    }

    public function test_guest_appointment_requires_name_and_phone_when_patient_is_missing(): void
    {
        $dentist = User::factory()->create();
        $appointmentDate = now()->addDay()->toDateString();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'guest_name' => 'New Visitor',
                'appointment_date' => $appointmentDate,
                'start_time' => '10:00',
                'end_time' => '10:30',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['guest_phone']);
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

    public function test_dentist_can_create_back_to_back_appointment_when_existing_times_have_seconds(): void
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
            'start_time' => '10:00:00',
            'end_time' => '10:30:00',
            'status' => Appointment::STATUS_COMPLETED,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'patient_id' => $patient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '10:30',
                'end_time' => '11:00',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertCreated()
            ->assertJsonPath('data.start_time', '10:30')
            ->assertJsonPath('data.end_time', '11:00');
    }

    public function test_dentist_cannot_create_appointment_in_past_slot(): void
    {
        // Backfilling past appointments was originally allowed (clinics often
        // log visits after the fact). The UX feedback was the opposite — the
        // form was being mis-used to record "the patient came in but I forgot
        // to schedule them," which collided with the no-show / completed status
        // workflow. FA-X1 closed that door on create by adding
        // `after_or_equal:today` to StoreAppointmentRequest; UpdateAppointment
        // still allows past dates so already-created appointments can be moved
        // (see `test_dentist_can_move_appointment_to_past_slot` for that path).
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
        ]);

        $pastDate = now()->subDay()->toDateString();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'patient_id' => $patient->id,
                'appointment_date' => $pastDate,
                'start_time' => '10:00',
                'end_time' => '10:30',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['appointment_date']);
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

    public function test_dentist_can_move_appointment_to_past_slot(): void
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

        $pastDate = now()->subDay()->toDateString();

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/appointments/{$appointment->id}", [
                'patient_id' => $patient->id,
                'appointment_date' => $pastDate,
                'start_time' => '11:00',
                'end_time' => '11:30',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertOk()
            ->assertJsonPath('data.appointment_date', $pastDate)
            ->assertJsonPath('data.updated_by.id', (string) $dentist->id)
            ->assertJsonPath('data.start_time', '11:00')
            ->assertJsonPath('data.end_time', '11:30');
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

    public function test_archived_patient_appointments_drop_out_of_the_list_and_return_on_restore(): void
    {
        // Archiving a patient soft-deletes them but intentionally keeps their
        // appointment rows for a possible restore. Those rows must NOT linger
        // in the calendar as ghost entries (their `patient` relation resolves
        // to null ("Unknown patient"). Restoring the patient brings them back.
        $dentist = User::factory()->create();
        $activePatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Active Patient',
        ]);
        $archivedPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Archived Patient',
        ]);
        $appointmentDate = now()->addDay()->toDateString();

        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $activePatient->id,
            'appointment_date' => $appointmentDate,
            'start_time' => '09:00',
            'end_time' => '09:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);
        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $archivedPatient->id,
            'appointment_date' => $appointmentDate,
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        // Both patients active → both appointments visible.
        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/appointments')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 2);

        $archivedPatient->delete();

        // Archived patient's appointment is hidden; only the active one remains.
        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/appointments')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 1)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.patient_name', 'Active Patient');

        $archivedPatient->restore();

        // Restoring the patient brings the appointment back automatically.
        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/appointments')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 2);
    }

    public function test_archived_patient_no_longer_blocks_their_appointment_slot(): void
    {
        // A slot held by an archived patient is invisible on the calendar, so
        // it must also stop blocking new bookings — otherwise the dentist sees
        // an empty slot but gets a phantom "conflict" error.
        $dentist = User::factory()->create();
        $archivedPatient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $newPatient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $appointmentDate = now()->addDays(2)->toDateString();

        Appointment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $archivedPatient->id,
            'appointment_date' => $appointmentDate,
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        // While the patient is active the slot is taken → conflict.
        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'patient_id' => $newPatient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '10:00',
                'end_time' => '10:30',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['start_time']);

        $archivedPatient->delete();

        // After archiving, the freed slot accepts the new booking.
        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/appointments', [
                'patient_id' => $newPatient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '10:00',
                'end_time' => '10:30',
                'status' => Appointment::STATUS_SCHEDULED,
            ])
            ->assertCreated();
    }
}
