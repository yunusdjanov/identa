<?php

namespace Database\Factories;

use App\Models\Invoice;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Invoice>
 */
class InvoiceFactory extends Factory
{
    protected $model = Invoice::class;

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
            'invoice_number' => 'INV-'.fake()->unique()->numerify('######'),
            'invoice_date' => fake()->date(),
            'due_date' => fake()->optional()->date(),
            'total_amount' => 0,
            'paid_amount' => 0,
            'balance' => 0,
            'status' => Invoice::STATUS_UNPAID,
            'notes' => fake()->optional()->sentence(),
        ];
    }
}
