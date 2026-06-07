<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DeviceRegistrationApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_register_a_push_token(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/devices/register', [
                'expo_push_token' => 'ExponentPushToken[abc123]',
                'platform' => 'ios',
                'app_version' => '1.0.0',
                'device_name' => 'iPhone 15 Pro',
            ])
            ->assertCreated()
            ->assertJsonPath('data.expo_push_token', 'ExponentPushToken[abc123]')
            ->assertJsonStructure(['data' => ['id', 'expo_push_token', 'registered_at']]);

        $this->assertDatabaseHas('devices', [
            'user_id' => $dentist->id,
            'expo_push_token' => 'ExponentPushToken[abc123]',
            'platform' => 'ios',
        ]);
    }

    public function test_reregistering_the_same_token_updates_instead_of_duplicating(): void
    {
        $dentist = User::factory()->create();

        $payload = [
            'expo_push_token' => 'ExponentPushToken[dedup]',
            'platform' => 'android',
            'app_version' => '1.0.0',
        ];

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/devices/register', $payload)
            ->assertCreated();

        // Same token, bumped app version + relaunch → 200 (updated, not created).
        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/devices/register', [...$payload, 'app_version' => '1.1.0'])
            ->assertOk();

        $this->assertSame(1, Device::where('user_id', $dentist->id)->count());
        $this->assertDatabaseHas('devices', [
            'expo_push_token' => 'ExponentPushToken[dedup]',
            'app_version' => '1.1.0',
        ]);
    }

    public function test_validation_rejects_bad_platform_and_missing_token(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/devices/register', [
                'platform' => 'windows',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['expo_push_token', 'platform']);
    }

    public function test_guest_is_unauthorized_and_admin_is_forbidden(): void
    {
        $this->postJson('/api/v1/devices/register', [])->assertUnauthorized();

        // Push tokens belong to the mobile app (dentist/assistant only).
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web')
            ->postJson('/api/v1/devices/register', [
                'expo_push_token' => 'ExponentPushToken[admin]',
                'platform' => 'ios',
            ])
            ->assertForbidden();
    }
}
