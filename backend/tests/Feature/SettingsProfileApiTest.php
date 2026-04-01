<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsProfileApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_get_and_update_profile_settings(): void
    {
        $dentist = User::factory()->create([
            'name' => 'Dr Test',
            'email' => 'dentist@example.com',
            'working_hours_start' => '09:00',
            'working_hours_end' => '18:00',
            'default_appointment_duration' => 30,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/settings/profile')
            ->assertOk()
            ->assertJsonPath('data.email', 'dentist@example.com')
            ->assertJsonPath('data.working_hours.start', '09:00');

        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/profile', [
                'name' => 'Dr Updated',
                'email' => 'updated@example.com',
                'phone' => '+15550000000',
                'practice_name' => 'Updated Dental',
                'license_number' => 'LIC-2026-AB',
                'address' => 'Main Street 1',
                'working_hours_start' => '08:00',
                'working_hours_end' => '17:00',
                'default_appointment_duration' => 45,
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Dr Updated')
            ->assertJsonPath('data.email', 'updated@example.com')
            ->assertJsonPath('data.practice_name', 'Updated Dental')
            ->assertJsonPath('data.working_hours.start', '08:00')
            ->assertJsonPath('data.default_appointment_duration', 45);
    }

    public function test_profile_update_validates_working_hours_and_email_uniqueness(): void
    {
        $dentist = User::factory()->create([
            'email' => 'dentist@example.com',
        ]);
        User::factory()->create([
            'email' => 'taken@example.com',
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/profile', [
                'email' => 'taken@example.com',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);

        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/profile', [
                'working_hours_start' => '18:00',
                'working_hours_end' => '09:00',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['working_hours_end']);
    }

    public function test_profile_update_validates_phone_and_text_lengths(): void
    {
        $dentist = User::factory()->create([
            'email' => 'dentist-validate@example.com',
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/profile', [
                'name' => 'Al',
                'phone' => '12345',
                'practice_name' => 'AB',
                'license_number' => str_repeat('x', 51),
                'address' => '12',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'name',
                'phone',
                'practice_name',
                'license_number',
                'address',
            ]);
    }

    public function test_guest_is_unauthorized_and_admin_forbidden_for_profile_routes(): void
    {
        $this->getJson('/api/v1/settings/profile')->assertUnauthorized();

        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web')
            ->getJson('/api/v1/settings/profile')
            ->assertForbidden();
    }
}
