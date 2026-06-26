<?php

namespace Database\Factories;

use App\Models\PaymentExpense;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PaymentExpense>
 */
class PaymentExpenseFactory extends Factory
{
    protected $model = PaymentExpense::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'dentist_id' => User::factory(),
            'title' => $this->faker->words(3, true),
            'amount' => $this->faker->numberBetween(50000, 1500000),
            'expense_date' => $this->faker->date(),
        ];
    }
}
