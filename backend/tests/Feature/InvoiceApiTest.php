<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\OdontogramEntry;
use App\Models\Payment;
use App\Models\Patient;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use ReflectionMethod;
use Tests\TestCase;

class InvoiceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_create_invoice_with_computed_totals(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        Carbon::setTestNow('2026-03-01 09:00:00');
        $response = $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/invoices', [
                'patient_id' => $patient->id,
                'invoice_date' => '2026-03-01',
                'notes' => 'Composite filling and xray',
                'items' => [
                    [
                        'description' => 'Composite filling',
                        'quantity' => 1,
                        'unit_price' => 120.5,
                    ],
                    [
                        'description' => 'Xray',
                        'quantity' => 2,
                        'unit_price' => 30,
                    ],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.patient_id', $patient->id)
            ->assertJsonPath('data.patient_name', $patient->full_name)
            ->assertJsonPath('data.patient_phone', $patient->phone)
            ->assertJsonPath('data.total_amount', 180.5)
            ->assertJsonPath('data.paid_amount', 0)
            ->assertJsonPath('data.balance', 180.5)
            ->assertJsonPath('data.status', Invoice::STATUS_UNPAID)
            ->assertJsonCount(2, 'data.items');

        $invoiceNumber = $response->json('data.invoice_number');
        $this->assertIsString($invoiceNumber);
        $this->assertMatchesRegularExpression('/^INV-\d{4}-\d{4}$/', $invoiceNumber);

        $this->assertDatabaseCount('invoice_items', 2);
        Carbon::setTestNow();
    }

    public function test_invoice_number_generation_is_monthly_sequential_per_dentist(): void
    {
        Carbon::setTestNow('2026-03-20 11:00:00');

        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);

        Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-2602-0099',
            'invoice_date' => '2026-02-28',
            'total_amount' => '50.00',
            'paid_amount' => '0.00',
            'balance' => '50.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-2603-0001',
            'invoice_date' => '2026-03-01',
            'total_amount' => '75.00',
            'paid_amount' => '0.00',
            'balance' => '75.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        Invoice::create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
            'invoice_number' => 'INV-2603-0099',
            'invoice_date' => '2026-03-01',
            'total_amount' => '80.00',
            'paid_amount' => '0.00',
            'balance' => '80.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/invoices', [
                'patient_id' => $patient->id,
                'invoice_date' => '2026-03-20',
                'items' => [
                    ['description' => 'Consultation', 'quantity' => 1, 'unit_price' => 120],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.invoice_number', 'INV-2603-0002');

        Carbon::setTestNow();
    }

    public function test_invoice_create_validates_item_description_min_length(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/invoices', [
                'patient_id' => $patient->id,
                'invoice_date' => '2026-03-01',
                'items' => [
                    [
                        'description' => 'ab',
                        'quantity' => 1,
                        'unit_price' => 100,
                    ],
                ],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['items.0.description']);
    }

    public function test_dentist_can_list_and_manage_only_owned_invoices(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $secondPatient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);

        $ownedInvoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-OWNED-1',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '0.00',
            'balance' => '100.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);
        Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $secondPatient->id,
            'invoice_number' => 'INV-OWNED-2',
            'invoice_date' => '2026-03-02',
            'total_amount' => '150.00',
            'paid_amount' => '150.00',
            'balance' => '0.00',
            'status' => Invoice::STATUS_PAID,
        ]);
        $otherInvoice = Invoice::create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
            'invoice_number' => 'INV-OTHER-1',
            'invoice_date' => '2026-03-01',
            'total_amount' => '200.00',
            'paid_amount' => '0.00',
            'balance' => '200.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/invoices')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.summary.total_count', 2)
            ->assertJsonPath('meta.summary.outstanding_count', 1)
            ->assertJsonPath('meta.summary.outstanding_total', 100)
            ->assertJsonPath('meta.summary.total_amount', 250);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/invoices?filter[patient_id]='.urlencode($patient->id))
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 1)
            ->assertJsonPath('meta.summary.total_count', 1)
            ->assertJsonPath('meta.summary.total_amount', 100)
            ->assertJsonPath('data.0.id', $ownedInvoice->id)
            ->assertJsonPath('data.0.patient_name', $patient->full_name)
            ->assertJsonPath('data.0.patient_phone', $patient->phone);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/invoices?filter[statuses]=unpaid,partially_paid')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 1)
            ->assertJsonPath('meta.summary.total_count', 1)
            ->assertJsonPath('meta.summary.total_amount', 100);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/invoices/{$otherInvoice->id}")
            ->assertNotFound();

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/invoices/{$otherInvoice->id}", [
                'patient_id' => $patient->id,
                'invoice_date' => '2026-03-02',
                'items' => [
                    ['description' => 'Checkup', 'quantity' => 1, 'unit_price' => 10],
                ],
            ])
            ->assertNotFound();

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/invoices/{$otherInvoice->id}")
            ->assertNotFound();
    }

    public function test_invoice_update_recalculates_balance_and_enforces_paid_amount_invariant(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-100',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '40.00',
            'balance' => '60.00',
            'status' => Invoice::STATUS_PARTIALLY_PAID,
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/invoices/{$invoice->id}", [
                'patient_id' => $patient->id,
                'invoice_date' => '2026-03-02',
                'items' => [
                    ['description' => 'Updated treatment', 'quantity' => 1, 'unit_price' => 120],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.total_amount', 120)
            ->assertJsonPath('data.paid_amount', 40)
            ->assertJsonPath('data.balance', 80)
            ->assertJsonPath('data.status', Invoice::STATUS_PARTIALLY_PAID);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/invoices/{$invoice->id}", [
                'patient_id' => $patient->id,
                'invoice_date' => '2026-03-02',
                'items' => [
                    ['description' => 'Too low total', 'quantity' => 1, 'unit_price' => 10],
                ],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['items']);
    }

    public function test_invoice_rejects_odontogram_entry_ids_not_owned_by_target_patient(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $otherPatient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $otherDentist = User::factory()->create();
        $otherDentistPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);

        $ownedEntry = OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $foreignEntry = OdontogramEntry::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherDentistPatient->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/invoices', [
                'patient_id' => $otherPatient->id,
                'invoice_date' => '2026-03-20',
                'items' => [
                    [
                        'description' => 'Invalid patient link',
                        'quantity' => 1,
                        'unit_price' => 50,
                        'odontogram_entry_id' => $ownedEntry->id,
                    ],
                ],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['items']);

        $this->actingAs($dentist, 'web')
            ->postJson('/api/v1/invoices', [
                'patient_id' => $patient->id,
                'invoice_date' => '2026-03-20',
                'items' => [
                    [
                        'description' => 'Invalid dentist link',
                        'quantity' => 1,
                        'unit_price' => 50,
                        'odontogram_entry_id' => $foreignEntry->id,
                    ],
                ],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['items']);
    }

    public function test_invoice_cannot_be_deleted_when_payments_exist(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-LOCKED-1',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '0.00',
            'balance' => '100.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        Payment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_id' => $invoice->id,
            'amount' => '20.00',
            'payment_method' => 'cash',
            'payment_date' => '2026-03-01',
        ]);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/invoices/{$invoice->id}")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['invoice']);
    }

    public function test_dentist_can_download_owned_invoice_pdf_with_payment_history(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-DL-1',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '30.00',
            'balance' => '70.00',
            'status' => Invoice::STATUS_PARTIALLY_PAID,
        ]);

        Payment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_id' => $invoice->id,
            'amount' => '30.00',
            'payment_method' => 'cash',
            'payment_date' => '2026-03-02',
        ]);

        $response = $this->actingAs($dentist, 'web')
            ->get("/api/v1/invoices/{$invoice->id}/download");

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringContainsString('attachment; filename="INV-DL-1.pdf"', (string) $response->headers->get('Content-Disposition'));
        $this->assertStringStartsWith('%PDF-', $response->getContent());
        $this->assertGreaterThan(1000, strlen($response->getContent()));
    }

    public function test_dentist_cannot_download_other_dentist_invoice_pdf(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);

        $otherInvoice = Invoice::create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
            'invoice_number' => 'INV-OTHER-DL',
            'invoice_date' => '2026-03-01',
            'total_amount' => '200.00',
            'paid_amount' => '0.00',
            'balance' => '200.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        $this->actingAs($dentist, 'web')
            ->get("/api/v1/invoices/{$otherInvoice->id}/download")
            ->assertNotFound();
    }

    public function test_invoice_pdf_template_is_localized_for_russian(): void
    {
        $dentist = User::factory()->create([
            'name' => 'Demo Dentist',
            'practice_name' => 'Demo Dental Studio',
        ]);
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Иван Иванов',
            'phone' => '+998901112233',
        ]);

        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-RU-1',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '30.00',
            'balance' => '70.00',
            'status' => Invoice::STATUS_PARTIALLY_PAID,
        ]);

        $invoice->items()->create([
            'description' => 'Лечение',
            'quantity' => 1,
            'unit_price' => '100.00',
            'total_price' => '100.00',
            'sort_order' => 0,
        ]);

        Payment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_id' => $invoice->id,
            'amount' => '30.00',
            'payment_method' => 'cash',
            'payment_date' => '2026-03-02',
        ]);

        $html = $this->renderInvoicePdfHtml($invoice, 'ru');

        $this->assertStringContainsString('СЧЕТ Identa', $html);
        $this->assertStringContainsString('История оплат', $html);
        $this->assertStringContainsString('Статус: Частично оплачен', $html);
        $this->assertStringContainsString('Наличные', $html);
        $this->assertStringContainsString('02.03.2026', $html);
        $this->assertStringNotContainsString('api.invoices_pdf', $html);
    }

    public function test_invoice_pdf_template_is_localized_for_uzbek(): void
    {
        $dentist = User::factory()->create([
            'name' => 'Demo Dentist',
            'practice_name' => 'Demo Dental Studio',
        ]);
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Azizbek Karimov',
            'phone' => '+998901112233',
        ]);

        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-UZ-1',
            'invoice_date' => '2026-03-01',
            'total_amount' => '100.00',
            'paid_amount' => '30.00',
            'balance' => '70.00',
            'status' => Invoice::STATUS_PARTIALLY_PAID,
        ]);

        $invoice->items()->create([
            'description' => 'Davolash',
            'quantity' => 1,
            'unit_price' => '100.00',
            'total_price' => '100.00',
            'sort_order' => 0,
        ]);

        Payment::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_id' => $invoice->id,
            'amount' => '30.00',
            'payment_method' => 'cash',
            'payment_date' => '2026-03-02',
        ]);

        $html = $this->renderInvoicePdfHtml($invoice, 'uz');

        $this->assertStringContainsString('Identa HISOB-FAKTURA', $html);
        $this->assertStringContainsString('Tolov tarixi', $html);
        $this->assertStringContainsString('Holat: Qisman tolangan', $html);
        $this->assertStringContainsString('Naqd', $html);
        $this->assertStringContainsString('02.03.2026', $html);
        $this->assertStringNotContainsString('api.invoices_pdf', $html);
    }

    public function test_guest_is_unauthorized_and_admin_forbidden_for_invoice_routes(): void
    {
        $this->getJson('/api/v1/invoices')->assertUnauthorized();

        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web')
            ->getJson('/api/v1/invoices')
            ->assertForbidden();
    }

    private function renderInvoicePdfHtml(Invoice $invoice, string $locale): string
    {
        $controller = app(\App\Http\Controllers\Api\InvoiceController::class);
        $method = new ReflectionMethod($controller, 'buildInvoicePdfViewData');
        $method->setAccessible(true);

        $originalLocale = app()->getLocale();
        app()->setLocale($locale);

        try {
            /** @var array<string, mixed> $data */
            $data = $method->invoke($controller, $invoice->load([
                'patient:id,patient_id,full_name,phone',
                'dentist:id,name,email,practice_name,phone,address',
                'items',
                'payments',
            ]));

            return view('pdf.invoice', $data)->render();
        } finally {
            app()->setLocale($originalLocale);
        }
    }
}


