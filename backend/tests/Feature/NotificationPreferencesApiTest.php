<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationPreferencesApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_defaults_are_returned_when_nothing_persisted(): void
    {
        $dentist = User::factory()->create(['notification_preferences' => null]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/settings/notifications')
            ->assertOk()
            ->assertJsonPath('data.push_enabled', true)
            ->assertJsonPath('data.appointment_reminder', true)
            ->assertJsonPath('data.new_appointment', true)
            ->assertJsonPath('data.payment_received', false)
            ->assertJsonPath('data.daily_summary', false);
    }

    public function test_partial_update_persists_and_leaves_other_toggles_intact(): void
    {
        $dentist = User::factory()->create(['notification_preferences' => null]);

        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/notifications', [
                'payment_received' => true,
                'push_enabled' => false,
            ])
            ->assertOk()
            ->assertJsonPath('data.payment_received', true)
            ->assertJsonPath('data.push_enabled', false)
            // Untouched toggles keep their default value, not reset to false.
            ->assertJsonPath('data.appointment_reminder', true);

        // A second partial update must not clobber the first.
        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/notifications', [
                'daily_summary' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.daily_summary', true)
            ->assertJsonPath('data.payment_received', true)
            ->assertJsonPath('data.push_enabled', false);

        $this->assertSame(false, $dentist->fresh()->notificationPreferences()['push_enabled']);
    }

    public function test_unknown_keys_are_ignored_and_non_boolean_is_rejected(): void
    {
        $dentist = User::factory()->create();

        // Unknown key silently dropped (still 200, no effect).
        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/notifications', [
                'malicious_key' => true,
            ])
            ->assertOk()
            ->assertJsonMissingPath('data.malicious_key');

        // Known key with a non-boolean value fails validation.
        $this->actingAs($dentist, 'web')
            ->putJson('/api/v1/settings/notifications', [
                'push_enabled' => 'not-a-bool',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['push_enabled']);
    }

    public function test_guest_is_unauthorized(): void
    {
        $this->getJson('/api/v1/settings/notifications')->assertUnauthorized();
        $this->putJson('/api/v1/settings/notifications', [])->assertUnauthorized();
    }
}
