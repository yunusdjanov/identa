<?php

namespace Database\Factories;

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Appointment>
 */
class AppointmentFactory extends Factory
{
    protected $model = Appointment::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'dentist_id' => User::factory(),
            'patient_id' => fn (array $attributes): string => Patient::factory()
                ->create(['dentist_id' => $attributes['dentist_id']])
                ->id,
            'appointment_date' => fake()->date(),
            'start_time' => '10:00',
            'end_time' => '10:30',
            'status' => fake()->randomElement([
                Appointment::STATUS_SCHEDULED,
                Appointment::STATUS_COMPLETED,
                Appointment::STATUS_CANCELLED,
                Appointment::STATUS_NO_SHOW,
            ]),
            'notes' => fake()->optional()->sentence(),
        ];
    }
}
