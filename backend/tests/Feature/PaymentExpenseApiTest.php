<?php

namespace Tests\Feature;

use App\Models\PaymentExpense;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PaymentExpenseApiTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_dentist_can_create_and_list_expenses_with_summary(): void
    {
        Carbon::setTestNow('2026-06-27 10:00:00');
        [$dentist] = $this->seedExpenseRecords();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments/expenses', [
                'title' => 'Rent',
                'amount' => 1200000,
                'expense_date' => '2026-06-27',
            ])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Rent')
            ->assertJsonPath('data.amount', 1200000)
            ->assertJsonPath('data.expense_date', '2026-06-27');

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/expenses?per_page=2')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 3)
            ->assertJsonPath('meta.pagination.total_pages', 2)
            ->assertJsonPath('meta.summary.total_count', 3)
            ->assertJsonPath('meta.summary.total_amount', 1950000)
            ->assertJsonPath('meta.summary.current_month_amount', 1650000)
            ->assertJsonPath('meta.summary.latest_expense_date', '2026-06-27')
            ->assertJsonPath('data.0.title', 'Rent');

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/expenses?filter[search]=materials')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 1)
            ->assertJsonPath('data.0.title', 'Materials');
    }

    public function test_dentist_only_sees_own_expenses(): void
    {
        [$dentist] = $this->seedExpenseRecords();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/expenses')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 2);
    }

    public function test_other_tenant_only_sees_own_expenses(): void
    {
        [, $otherDentist] = $this->seedExpenseRecords();

        $this->actingAs($otherDentist, 'web')
            ->getJson('/api/v1/payments/expenses')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 1)
            ->assertJsonPath('data.0.title', 'Other rent');
    }

    public function test_expense_manage_permission_is_required_to_create(): void
    {
        $dentist = User::factory()->create();
        $assistant = User::factory()->create([
            'role' => 'assistant',
            'dentist_owner_id' => $dentist->id,
            'assistant_permissions' => [User::PERMISSION_PAYMENTS_VIEW],
        ]);

        $this->actingAs($assistant, 'web')
            ->getJson('/api/v1/payments/expenses')
            ->assertOk();

        $this->actingAs($assistant, 'web')
            ->postJson('/api/v1/payments/expenses', [
                'title' => 'Rent',
                'amount' => 1200000,
                'expense_date' => '2026-06-27',
            ])
            ->assertForbidden();
    }

    public function test_expense_validation_rejects_invalid_payload(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments/expenses', [
                'title' => '',
                'amount' => 0,
                'expense_date' => 'not-a-date',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['title', 'amount', 'expense_date']);
    }

    /**
     * @return array{User, User}
     */
    private function seedExpenseRecords(): array
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();

        PaymentExpense::factory()->create([
            'dentist_id' => $dentist->id,
            'title' => 'Materials',
            'amount' => 450000,
            'expense_date' => '2026-06-10',
            'created_at' => '2026-06-10 09:00:00',
        ]);
        PaymentExpense::factory()->create([
            'dentist_id' => $dentist->id,
            'title' => 'Utilities',
            'amount' => 300000,
            'expense_date' => '2026-05-20',
            'created_at' => '2026-05-20 09:00:00',
        ]);
        PaymentExpense::factory()->create([
            'dentist_id' => $otherDentist->id,
            'title' => 'Other rent',
            'amount' => 999000,
            'expense_date' => '2026-06-11',
        ]);

        return [$dentist, $otherDentist];
    }
}
