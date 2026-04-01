<?php

namespace Database\Factories;

use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Payment>
 */
class PaymentFactory extends Factory
{
    protected $model = Payment::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'invoice_id' => Invoice::factory(),
            'dentist_id' => fn (array $attributes): int => (int) Invoice::query()
                ->findOrFail($attributes['invoice_id'])
                ->dentist_id,
            'patient_id' => fn (array $attributes): string => (string) Invoice::query()
                ->findOrFail($attributes['invoice_id'])
                ->patient_id,
            'amount' => fake()->randomFloat(2, 10, 300),
            'payment_method' => fake()->randomElement([
                Payment::METHOD_CASH,
                Payment::METHOD_CARD,
                Payment::METHOD_BANK_TRANSFER,
            ]),
            'payment_date' => fake()->date(),
            'notes' => fake()->optional()->sentence(),
        ];
    }
}
