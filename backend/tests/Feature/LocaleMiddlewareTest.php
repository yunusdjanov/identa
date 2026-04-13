<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocaleMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    public function test_request_locale_header_localizes_validation_errors(): void
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
            ->withHeaders(['X-Locale' => 'ru'])
            ->postJson('/api/v1/appointments', [
                'patient_id' => $patient->id,
                'appointment_date' => $appointmentDate,
                'start_time' => '10:15',
                'end_time' => '10:45',
            ])
            ->assertUnprocessable()
            ->assertHeader('Content-Language', 'ru')
            ->assertJsonPath('errors.start_time.0', __('api.appointments.conflict', [], 'ru'));
    }

    public function test_locale_cookie_localizes_role_forbidden_message(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->withHeaders(['Cookie' => 'identa_locale=uz'])
            ->getJson('/api/v1/admin/dentists')
            ->assertForbidden()
            ->assertHeader('Content-Language', 'uz')
            ->assertJsonPath('error.message', __('api.auth.forbidden', [], 'uz'));
    }

    public function test_accept_language_localizes_framework_unauthenticated_message(): void
    {
        $this->withHeaders(['Accept-Language' => 'ru-RU,ru;q=0.9,en;q=0.8'])
            ->getJson('/api/v1/patients')
            ->assertUnauthorized()
            ->assertHeader('Content-Language', 'ru')
            ->assertJsonPath('message', __('auth.unauthenticated', [], 'ru'));
    }
}
