<?php

namespace Database\Factories;

use App\Models\Patient;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Patient>
 */
class PatientFactory extends Factory
{
    protected $model = Patient::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'dentist_id' => User::factory(),
            'patient_id' => strtoupper(fake()->unique()->bothify('PT-####??')),
            'full_name' => fake()->name(),
            'phone' => fake()->numerify('+1##########'),
            'secondary_phone' => fake()->optional()->numerify('+1##########'),
            'address' => fake()->optional()->streetAddress(),
            'date_of_birth' => fake()->optional()->date(),
            'gender' => fake()->optional()->randomElement(['male', 'female']),
            'medical_history' => fake()->optional()->sentence(),
            'allergies' => fake()->optional()->sentence(),
            'current_medications' => fake()->optional()->sentence(),
        ];
    }
}
