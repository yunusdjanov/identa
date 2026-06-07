<?php

namespace Database\Factories;

use App\Models\Device;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Device>
 */
class DeviceFactory extends Factory
{
    protected $model = Device::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'expo_push_token' => 'ExponentPushToken['.fake()->unique()->lexify('??????????').']',
            'platform' => fake()->randomElement([Device::PLATFORM_IOS, Device::PLATFORM_ANDROID]),
            'app_version' => '1.0.0',
            'device_name' => fake()->randomElement(['iPhone 15 Pro', 'Samsung Galaxy S24', 'Pixel 8']),
            'last_registered_at' => now(),
        ];
    }
}
