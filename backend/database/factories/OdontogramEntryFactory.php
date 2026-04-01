<?php

namespace Database\Factories;

use App\Models\OdontogramEntry;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OdontogramEntry>
 */
class OdontogramEntryFactory extends Factory
{
    protected $model = OdontogramEntry::class;

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
            'tooth_number' => fake()->numberBetween(1, 32),
            'condition_type' => fake()->randomElement([
                OdontogramEntry::TYPE_HEALTHY,
                OdontogramEntry::TYPE_CAVITY,
                OdontogramEntry::TYPE_FILLING,
                OdontogramEntry::TYPE_CROWN,
                OdontogramEntry::TYPE_ROOT_CANAL,
                OdontogramEntry::TYPE_EXTRACTION,
                OdontogramEntry::TYPE_IMPLANT,
            ]),
            'surface' => fake()->optional()->randomElement(['occlusal', 'mesial', 'distal', 'buccal', 'lingual']),
            'material' => fake()->optional()->randomElement(['composite', 'amalgam', 'porcelain', 'gold']),
            'severity' => fake()->optional()->randomElement(['mild', 'moderate', 'severe']),
            'condition_date' => fake()->date(),
            'notes' => fake()->optional()->sentence(),
        ];
    }
}
