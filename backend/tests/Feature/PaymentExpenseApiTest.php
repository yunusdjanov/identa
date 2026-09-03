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
                'amount' => 1200,
                'quantity' => 2,
                'currency' => PaymentExpense::CURRENCY_USD,
                'expense_date' => '2026-06-27',
            ])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Rent')
            ->assertJsonPath('data.amount', 1200)
            ->assertJsonPath('data.quantity', 2)
            ->assertJsonPath('data.currency', PaymentExpense::CURRENCY_USD)
            ->assertJsonPath('data.expense_date', '2026-06-27');

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/expenses?per_page=2')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 3)
            ->assertJsonPath('meta.pagination.total_pages', 2)
            ->assertJsonPath('meta.summary.total_count', 3)
            ->assertJsonPath('meta.summary.total_amount', 750000)
            ->assertJsonPath('meta.summary.current_month_amount', 450000)
            ->assertJsonPath('meta.summary.totals_by_currency.UZS', 750000)
            ->assertJsonPath('meta.summary.totals_by_currency.USD', 1200)
            ->assertJsonPath('meta.summary.current_month_by_currency.UZS', 450000)
            ->assertJsonPath('meta.summary.current_month_by_currency.USD', 1200)
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

    public function test_expense_list_can_skip_summary_for_table_only_requests(): void
    {
        [$dentist] = $this->seedExpenseRecords();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/expenses?per_page=1&include_summary=0')
            ->assertOk()
            ->assertJsonMissingPath('meta.summary')
            ->assertJsonPath('meta.pagination.total', 2)
            ->assertJsonCount(1, 'data');
    }

    public function test_dentist_can_update_and_delete_own_expenses(): void
    {
        [$dentist, $otherDentist] = $this->seedExpenseRecords();
        $expense = PaymentExpense::query()
            ->where('dentist_id', $dentist->id)
            ->where('title', 'Materials')
            ->firstOrFail();
        $otherExpense = PaymentExpense::query()
            ->where('dentist_id', $otherDentist->id)
            ->firstOrFail();

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/payments/expenses/{$expense->id}", [
                'title' => 'Implant kit',
                'amount' => 125.5,
                'quantity' => 3,
                'currency' => PaymentExpense::CURRENCY_USD,
                'expense_date' => '2026-06-18',
            ])
            ->assertOk()
            ->assertJsonPath('data.title', 'Implant kit')
            ->assertJsonPath('data.amount', 125.5)
            ->assertJsonPath('data.quantity', 3)
            ->assertJsonPath('data.currency', PaymentExpense::CURRENCY_USD)
            ->assertJsonPath('data.expense_date', '2026-06-18');

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/payments/expenses/{$otherExpense->id}", [
                'title' => 'Blocked',
                'amount' => 10,
                'quantity' => 1,
                'currency' => PaymentExpense::CURRENCY_UZS,
                'expense_date' => '2026-06-18',
            ])
            ->assertNotFound();

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/payments/expenses/{$expense->id}")
            ->assertNoContent();

        $this->assertSoftDeleted('payment_expenses', [
            'id' => $expense->id,
        ]);
    }

    public function test_expense_manage_permission_is_required_to_create_update_and_delete(): void
    {
        $dentist = User::factory()->create();
        $expense = PaymentExpense::factory()->create([
            'dentist_id' => $dentist->id,
        ]);
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

        $this->actingAs($assistant, 'web')
            ->putJson("/api/v1/payments/expenses/{$expense->id}", [
                'title' => 'Rent',
                'amount' => 1200000,
                'quantity' => 1,
                'currency' => PaymentExpense::CURRENCY_UZS,
                'expense_date' => '2026-06-27',
            ])
            ->assertForbidden();

        $this->actingAs($assistant, 'web')
            ->deleteJson("/api/v1/payments/expenses/{$expense->id}")
            ->assertForbidden();
    }

    public function test_expense_validation_rejects_invalid_payload(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments/expenses', [
                'title' => '',
                'amount' => 0,
                'quantity' => 0,
                'currency' => 'EUR',
                'expense_date' => 'not-a-date',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['title', 'amount', 'quantity', 'currency', 'expense_date']);
    }

    public function test_expense_input_is_normalized_before_validation_and_persistence(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments/expenses', [
                'title' => '   ',
                'amount' => 100,
                'expense_date' => '2026-06-27',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['title']);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments/expenses', [
                'title' => '  Implant supplies  ',
                'amount' => 100,
                'quantity' => null,
                'currency' => ' usd ',
                'expense_date' => '2026-06-27',
            ])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Implant supplies')
            ->assertJsonPath('data.quantity', 1)
            ->assertJsonPath('data.currency', PaymentExpense::CURRENCY_USD);
    }

    public function test_expense_list_rejects_invalid_or_unbounded_filters(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/expenses?per_page=101&filter[search]='.str_repeat('a', 161))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['per_page', 'filter.search']);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/expenses?filter[date_from]=2026-07-10&filter[date_to]=2026-07-01')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['filter.date_to']);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/expenses?include_summary=invalid')
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['include_summary']);
    }

    public function test_expense_create_is_idempotent_and_rejects_key_reuse_with_other_payload(): void
    {
        $dentist = User::factory()->create();
        $payload = [
            'title' => 'Sterilization supplies',
            'amount' => 240000,
            'quantity' => 2,
            'currency' => PaymentExpense::CURRENCY_UZS,
            'expense_date' => '2026-07-26',
        ];

        $first = $this->actingAs($dentist, 'web')
            ->withHeader('Idempotency-Key', 'expense-test-001')
            ->postJson('/api/v1/payments/expenses', $payload)
            ->assertCreated();

        $second = $this->actingAs($dentist, 'web')
            ->withHeader('Idempotency-Key', 'expense-test-001')
            ->postJson('/api/v1/payments/expenses', $payload)
            ->assertCreated();

        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertDatabaseCount('payment_expenses', 1);
        $this->assertDatabaseCount('audit_logs', 1);

        $this->actingAs($dentist, 'web')
            ->withHeader('Idempotency-Key', 'expense-test-001')
            ->postJson('/api/v1/payments/expenses', [
                ...$payload,
                'amount' => 250000,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['idempotency_key']);

        $this->actingAs($dentist, 'web')
            ->deleteJson('/api/v1/payments/expenses/'.$first->json('data.id'))
            ->assertNoContent();

        $this->actingAs($dentist, 'web')
            ->withHeader('Idempotency-Key', 'expense-test-001')
            ->postJson('/api/v1/payments/expenses', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['idempotency_key']);
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
