<?php

namespace Database\Factories;

use App\Models\PatientCategory;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PatientCategory>
 */
class PatientCategoryFactory extends Factory
{
    protected $model = PatientCategory::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'dentist_id' => User::factory(),
            'name' => fake()->unique()->words(2, true),
            'color' => fake()->randomElement([
                '#3B82F6',
                '#10B981',
                '#F59E0B',
                '#EF4444',
                '#8B5CF6',
                '#14B8A6',
            ]),
            'sort_order' => fake()->numberBetween(0, 20),
        ];
    }
}
