<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_record_partial_and_full_payments_with_balance_updates(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-PAY-1',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '0.00',
            'balance' => '100.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments', [
                'invoice_id' => $invoice->id,
                'amount' => 30,
                'payment_method' => 'cash',
                'payment_date' => '2026-03-01',
            ])
            ->assertCreated()
            ->assertJsonPath('data.invoice_id', $invoice->id)
            ->assertJsonPath('data.amount', 30);

        $invoice->refresh();
        $this->assertSame('30.00', $invoice->paid_amount);
        $this->assertSame('70.00', $invoice->balance);
        $this->assertSame(Invoice::STATUS_PARTIALLY_PAID, $invoice->status);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments', [
                'invoice_id' => $invoice->id,
                'amount' => 70,
                'payment_method' => 'card',
                'payment_date' => '2026-03-02',
            ])
            ->assertCreated();

        $invoice->refresh();
        $this->assertSame('100.00', $invoice->paid_amount);
        $this->assertSame('0.00', $invoice->balance);
        $this->assertSame(Invoice::STATUS_PAID, $invoice->status);
    }

    public function test_cannot_overpay_invoice(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-PAY-2',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '60.00',
            'balance' => '40.00',
            'status' => Invoice::STATUS_PARTIALLY_PAID,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments', [
                'invoice_id' => $invoice->id,
                'amount' => 50,
                'payment_method' => 'cash',
                'payment_date' => '2026-03-02',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['amount']);
    }

    public function test_dentist_cannot_pay_other_dentist_invoice(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);
        $otherInvoice = Invoice::create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
            'invoice_number' => 'INV-PAY-3',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '0.00',
            'balance' => '100.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/payments', [
                'invoice_id' => $otherInvoice->id,
                'amount' => 20,
                'payment_method' => 'cash',
                'payment_date' => '2026-03-02',
            ])
            ->assertStatus(422);
    }

    public function test_dentist_can_list_only_owned_payments(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $secondPatient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);

        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-PAY-4',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '0.00',
            'balance' => '100.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);
        $otherInvoice = Invoice::create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
            'invoice_number' => 'INV-PAY-5',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '0.00',
            'balance' => '100.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);
        $secondInvoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $secondPatient->id,
            'invoice_number' => 'INV-PAY-6',
            'invoice_date' => '2026-03-02',
            'total_amount' => '120.00',
            'paid_amount' => '0.00',
            'balance' => '120.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        $this->actingAs($dentist, 'web')->postJson('/api/v1/payments', [
            'invoice_id' => $invoice->id,
            'amount' => 10,
            'payment_method' => 'cash',
            'payment_date' => '2026-03-02',
        ]);
        $this->actingAs($dentist, 'web')->postJson('/api/v1/payments', [
            'invoice_id' => $secondInvoice->id,
            'amount' => 20,
            'payment_method' => 'card',
            'payment_date' => '2026-03-03',
        ]);
        $this->actingAs($otherDentist, 'web')->postJson('/api/v1/payments', [
            'invoice_id' => $otherInvoice->id,
            'amount' => 10,
            'payment_method' => 'cash',
            'payment_date' => '2026-03-02',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.summary.total_count', 2)
            ->assertJsonPath('meta.summary.total_amount', 30);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments?filter[patient_id]='.urlencode($patient->id))
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 1)
            ->assertJsonPath('meta.summary.total_count', 1)
            ->assertJsonPath('meta.summary.total_amount', 10)
            ->assertJsonPath('data.0.invoice_id', $invoice->id);
    }

    public function test_dentist_can_update_payment_with_invoice_recalculation(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-PAY-UPD-1',
            'invoice_date' => '2026-03-01',
            'total_amount' => '300.00',
            'paid_amount' => '100.00',
            'balance' => '200.00',
            'status' => Invoice::STATUS_PARTIALLY_PAID,
        ]);

        $payment = Payment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_id' => $invoice->id,
            'amount' => '100.00',
            'payment_method' => 'cash',
            'payment_date' => '2026-03-02',
            'notes' => 'Initial payment',
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/payments/{$payment->id}", [
                'amount' => 150,
                'payment_method' => 'card',
                'payment_date' => '2026-03-03',
                'notes' => 'Updated payment',
            ])
            ->assertOk()
            ->assertJsonPath('data.id', $payment->id)
            ->assertJsonPath('data.amount', 150)
            ->assertJsonPath('data.payment_method', 'card');

        $invoice->refresh();
        $payment->refresh();
        $this->assertSame('150.00', $payment->amount);
        $this->assertSame('150.00', $invoice->paid_amount);
        $this->assertSame('150.00', $invoice->balance);
        $this->assertSame(Invoice::STATUS_PARTIALLY_PAID, $invoice->status);
    }

    public function test_dentist_can_delete_payment_with_invoice_recalculation(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-PAY-DEL-1',
            'invoice_date' => '2026-03-01',
            'total_amount' => '300.00',
            'paid_amount' => '300.00',
            'balance' => '0.00',
            'status' => Invoice::STATUS_PAID,
        ]);

        $firstPayment = Payment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_id' => $invoice->id,
            'amount' => '100.00',
            'payment_method' => 'cash',
            'payment_date' => '2026-03-01',
        ]);
        $secondPayment = Payment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_id' => $invoice->id,
            'amount' => '200.00',
            'payment_method' => 'card',
            'payment_date' => '2026-03-02',
        ]);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/payments/{$secondPayment->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('payments', ['id' => $secondPayment->id]);
        $this->assertDatabaseHas('payments', ['id' => $firstPayment->id]);

        $invoice->refresh();
        $this->assertSame('100.00', $invoice->paid_amount);
        $this->assertSame('200.00', $invoice->balance);
        $this->assertSame(Invoice::STATUS_PARTIALLY_PAID, $invoice->status);
    }

    public function test_dentist_cannot_update_or_delete_other_dentist_payment(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);
        $otherInvoice = Invoice::create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
            'invoice_number' => 'INV-PAY-OTHER-UPD',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '20.00',
            'balance' => '80.00',
            'status' => Invoice::STATUS_PARTIALLY_PAID,
        ]);

        $otherPayment = Payment::create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
            'invoice_id' => $otherInvoice->id,
            'amount' => '20.00',
            'payment_method' => 'cash',
            'payment_date' => '2026-03-01',
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/payments/{$otherPayment->id}", [
                'amount' => 10,
                'payment_method' => 'card',
                'payment_date' => '2026-03-02',
                'notes' => 'Trying to change',
            ])
            ->assertNotFound();

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/payments/{$otherPayment->id}")
            ->assertNotFound();
    }

    public function test_guest_is_unauthorized_and_admin_forbidden_for_payments_routes(): void
    {
        $this->getJson('/api/v1/payments')->assertUnauthorized();

        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web')
            ->getJson('/api/v1/payments')
            ->assertForbidden();
    }
}
