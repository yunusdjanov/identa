<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\Treatment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Mobile "quick payment" flow: POST /api/v1/patients/{id}/quick-payments
 * atomically creates an Invoice + InvoiceItem + Payment and (when
 * treatment_id is supplied) mirrors the amount onto the Treatment row.
 *
 * Sister to PaymentApiTest — the canonical /payments endpoint requires
 * a pre-existing invoice_id; this one bridges that gap for the mobile UI
 * which models payments per-treatment.
 */
class QuickPaymentApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_record_quick_payment_without_treatment(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/quick-payments", [
                'amount' => 150,
                'payment_method' => Payment::METHOD_CASH,
                'payment_date' => '2026-05-23',
            ])
            ->assertCreated()
            ->assertJsonPath('data.amount', 150)
            ->assertJsonPath('data.payment_method', Payment::METHOD_CASH)
            ->assertJsonPath('data.payment_date', '2026-05-23');

        // Side-effects: one invoice + one item + one payment created.
        $this->assertSame(1, Invoice::query()->where('dentist_id', $dentist->id)->count());
        $invoice = Invoice::query()->where('dentist_id', $dentist->id)->first();
        $this->assertSame(Invoice::STATUS_PAID, $invoice->status);
        $this->assertSame('150.00', $invoice->total_amount);
        $this->assertSame('150.00', $invoice->paid_amount);
        $this->assertSame('0.00', $invoice->balance);
        $this->assertSame(1, $invoice->items()->count());
        $this->assertSame(1, $invoice->payments()->count());
    }

    public function test_quick_payment_mirrors_amount_onto_treatment_paid_amount(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'cost' => '500.00',
            'debt_amount' => '500.00',
            'paid_amount' => '100.00',
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/quick-payments", [
                'amount' => 200,
                'payment_method' => Payment::METHOD_CARD,
                'payment_date' => '2026-05-23',
                'treatment_id' => $treatment->id,
            ])
            ->assertCreated();

        $treatment->refresh();
        // 100 prior + 200 new = 300 total paid on the treatment
        $this->assertSame('300.00', $treatment->paid_amount);
    }

    public function test_quick_payment_rejects_amount_exceeding_treatment_balance(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'cost' => '300.00',
            'debt_amount' => '300.00',
            'paid_amount' => '250.00',
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/quick-payments", [
                'amount' => 100, // remaining is only 50
                'payment_method' => Payment::METHOD_CASH,
                'payment_date' => '2026-05-23',
                'treatment_id' => $treatment->id,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['amount']);

        // No side-effects on failure: nothing in invoices/payments/treatment
        $this->assertSame(0, Invoice::query()->where('dentist_id', $dentist->id)->count());
        $treatment->refresh();
        $this->assertSame('250.00', $treatment->paid_amount);
    }

    public function test_quick_payment_rejects_invalid_method(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/quick-payments", [
                'amount' => 100,
                'payment_method' => 'bitcoin', // not in enum
                'payment_date' => '2026-05-23',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['payment_method']);
    }

    public function test_dentist_cannot_record_payment_for_other_dentist_patient(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$otherPatient->id}/quick-payments", [
                'amount' => 100,
                'payment_method' => Payment::METHOD_CASH,
                'payment_date' => '2026-05-23',
            ])
            ->assertStatus(422); // patient ownership rule fires

        $this->assertSame(0, Invoice::query()->count());
        $this->assertSame(0, Payment::query()->count());
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $patient = Patient::factory()->create();

        $this->postJson("/api/v1/patients/{$patient->id}/quick-payments", [
            'amount' => 100,
            'payment_method' => Payment::METHOD_CASH,
            'payment_date' => '2026-05-23',
        ])->assertStatus(401);
    }

    public function test_uses_treatment_type_or_default_description_for_invoice_line(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        // Without description — falls back to "Manual payment - <date>"
        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/quick-payments", [
                'amount' => 100,
                'payment_method' => Payment::METHOD_CASH,
                'payment_date' => '2026-05-23',
            ])
            ->assertCreated();

        $invoice = Invoice::query()->where('dentist_id', $dentist->id)->first();
        $item = $invoice->items()->first();
        $this->assertStringStartsWith('Manual payment', $item->description);
        $this->assertSame('100.00', $item->unit_price);
        $this->assertSame(1, $item->quantity);
        $this->assertSame('100.00', $item->total_price);
    }

    public function test_with_explicit_description_uses_it(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/quick-payments", [
                'amount' => 75,
                'payment_method' => Payment::METHOD_BANK_TRANSFER,
                'payment_date' => '2026-05-23',
                'description' => 'Tish davolash',
            ])
            ->assertCreated();

        $invoice = Invoice::query()->where('dentist_id', $dentist->id)->first();
        $this->assertSame('Tish davolash', $invoice->items()->first()->description);
    }

    public function test_notes_field_persists_when_supplied(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/quick-payments", [
                'amount' => 200,
                'payment_method' => Payment::METHOD_CASH,
                'payment_date' => '2026-05-23',
                'notes' => 'Partial — remainder next visit',
            ])
            ->assertCreated()
            ->assertJsonPath('data.notes', 'Partial — remainder next visit');
    }
}
