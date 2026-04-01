<?php

namespace Database\Factories;

use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Treatment>
 */
class TreatmentFactory extends Factory
{
    protected $model = Treatment::class;

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
            'tooth_number' => fake()->optional()->numberBetween(1, 32),
            'teeth' => fn (array $attributes): ?array => isset($attributes['tooth_number']) && $attributes['tooth_number'] !== null
                ? [(int) $attributes['tooth_number']]
                : null,
            'treatment_type' => fake()->randomElement(['Cleaning', 'Filling', 'Extraction', 'Root Canal']),
            'description' => fake()->optional()->sentence(),
            'comment' => fake()->optional()->sentence(),
            'treatment_date' => fake()->date(),
            'cost' => fake()->optional()->randomFloat(2, 50, 500),
            'debt_amount' => fn (array $attributes): string => number_format((float) ($attributes['cost'] ?? fake()->randomFloat(2, 50, 500)), 2, '.', ''),
            'paid_amount' => fn (array $attributes): string => number_format(min((float) ($attributes['debt_amount'] ?? $attributes['cost'] ?? 0), fake()->randomFloat(2, 0, 200)), 2, '.', ''),
            'notes' => fake()->optional()->sentence(),
            'before_image_disk' => null,
            'before_image_path' => null,
            'after_image_disk' => null,
            'after_image_path' => null,
        ];
    }
}
