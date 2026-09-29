<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
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
            'password' => Hash::make('CurrentPass123'),
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/settings/profile')
            ->assertOk()
            ->assertJsonPath('data.email', 'dentist@example.com')
            ->assertJsonPath('data.show_record_authors', false)
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
                'show_record_authors' => true,
                'current_password' => 'CurrentPass123',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Dr Updated')
            ->assertJsonPath('data.email', 'updated@example.com')
            ->assertJsonPath('data.practice_name', 'Updated Dental')
            ->assertJsonPath('data.working_hours.start', '08:00')
            ->assertJsonPath('data.default_appointment_duration', 45)
            ->assertJsonPath('data.show_record_authors', true);

        $this->assertDatabaseHas('users', [
            'id' => $dentist->id,
            'show_record_authors' => true,
        ]);
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

        $dentist->update([
            'working_hours_start' => '09:00',
            'working_hours_end' => '18:00',
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/profile', [
                'working_hours_start' => '19:00',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['working_hours_end']);
    }

    public function test_phone_can_be_cleared_with_null(): void
    {
        $dentist = User::factory()->create(['phone' => '+998901234567']);

        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/profile', ['phone' => null])
            ->assertOk()
            ->assertJsonPath('data.phone', null);

        $this->assertNull($dentist->fresh()->phone);
    }

    public function test_email_change_requires_password_and_revokes_other_credentials(): void
    {
        config()->set('session.driver', 'database');
        $dentist = User::factory()->create([
            'email' => 'old@example.com',
            'password' => Hash::make('CurrentPass123'),
            'provider' => 'google',
            'google_id' => 'google-subject-1',
            'remember_token' => 'remember-me',
        ]);
        $dentist->createToken('phone');
        $dentist->createToken('tablet');
        DB::table('sessions')->insert([
            'id' => 'stale-profile-session',
            'user_id' => $dentist->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'test',
            'payload' => 'test-session',
            'last_activity' => now()->timestamp,
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/profile', ['email' => 'new@example.com'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['current_password']);

        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/profile', [
                'email' => 'new@example.com',
                'current_password' => 'wrong-password',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['current_password']);

        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/profile', [
                'email' => 'new@example.com',
                'current_password' => 'CurrentPass123',
            ])
            ->assertOk()
            ->assertJsonPath('data.email', 'new@example.com');

        $updated = $dentist->fresh();
        $this->assertNull($updated->email_verified_at);
        $this->assertNull($updated->google_id);
        $this->assertNull($updated->remember_token);
        $this->assertSame('email', $updated->provider);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $dentist->id]);
        $this->assertDatabaseMissing('sessions', ['id' => 'stale-profile-session']);

        $audit = AuditLog::query()
            ->where('event_type', 'settings.profile.updated')
            ->where('entity_id', (string) $dentist->id)
            ->latest('created_at')
            ->firstOrFail();
        $this->assertSame(['email'], $audit->metadata['changed_fields']);
        $this->assertArrayNotHasKey('before', $audit->metadata);
        $this->assertArrayNotHasKey('after', $audit->metadata);
        $this->assertStringNotContainsString('old@example.com', json_encode($audit->metadata));
        $this->assertStringNotContainsString('new@example.com', json_encode($audit->metadata));
    }

    public function test_passwordless_account_cannot_change_login_email(): void
    {
        $dentist = User::factory()->create([
            'password' => null,
            'provider' => 'google',
            'google_id' => 'google-only-account',
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/profile', [
                'email' => 'changed@example.com',
                'current_password' => 'irrelevant',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);
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

    public function test_guest_is_unauthorized_and_admin_is_authorized_for_profile_routes(): void
    {
        // /settings/profile is the single endpoint the dentist, assistant, AND
        // admin "Settings → Account" form all hit. A-C1 added the admin role
        // to the route — without it, admins silently 403'd on save. The shape
        // for admin is name + email only (ProfileSettingsService::update()
        // filters the payload by role), but the GET must succeed.
        $this->getJson('/api/v1/settings/profile')->assertUnauthorized();

        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web')
            ->getJson('/api/v1/settings/profile')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'email',
                    'name',
                ],
            ]);
    }
}
