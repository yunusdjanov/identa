<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PaymentLedgerApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_patient_ledger_returns_paginated_patient_balances_and_summary(): void
    {
        [$dentist, $patientWithDebt, $settledPatient] = $this->seedLedgerRecords();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/ledger/patients?per_page=1')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 2)
            ->assertJsonPath('meta.pagination.total_pages', 2)
            ->assertJsonPath('meta.summary.total_debt', 250000)
            ->assertJsonPath('meta.summary.total_paid', 130000)
            ->assertJsonPath('meta.summary.total_balance', 120000)
            ->assertJsonPath('meta.summary.total_patients', 2)
            ->assertJsonPath('meta.summary.total_entries', 3)
            ->assertJsonPath('data.0.patient_id', (string) $patientWithDebt->id)
            ->assertJsonPath('data.0.patient_name', $patientWithDebt->full_name)
            ->assertJsonPath('data.0.total_debt', 200000)
            ->assertJsonPath('data.0.total_paid', 80000)
            ->assertJsonPath('data.0.balance', 120000)
            ->assertJsonPath('data.0.entry_count', 2);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/ledger/patients?filter[search]='.urlencode($settledPatient->patient_id))
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 1)
            ->assertJsonPath('data.0.patient_id', (string) $settledPatient->id);
    }

    public function test_history_ledger_is_paginated_and_preserves_outstanding_patient_filter_semantics(): void
    {
        [$dentist, $patientWithDebt] = $this->seedLedgerRecords();

        $response = $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/ledger/history?filter[outstanding]=1&per_page=10')
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 2)
            ->assertJsonPath('meta.summary.total_entries', 2)
            ->assertJsonPath('data.0.patient_id', (string) $patientWithDebt->id)
            ->assertJsonPath('data.0.created_by.name', $dentist->name);

        $this->assertSame(
            [(string) $patientWithDebt->id],
            array_values(array_unique(array_column($response->json('data'), 'patient_id')))
        );
    }

    public function test_patient_ledger_includes_zero_row_when_specific_patient_has_no_treatments(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Empty History',
            'phone' => '+998900000099',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/payments/ledger/patients?filter[patient_id]='.urlencode((string) $patient->id))
            ->assertOk()
            ->assertJsonPath('meta.pagination.total', 1)
            ->assertJsonPath('meta.summary.total_debt', 0)
            ->assertJsonPath('meta.summary.total_paid', 0)
            ->assertJsonPath('meta.summary.total_balance', 0)
            ->assertJsonPath('meta.summary.total_entries', 0)
            ->assertJsonPath('data.0.patient_id', (string) $patient->id)
            ->assertJsonPath('data.0.entry_count', 0);
    }

    public function test_payment_ledger_requires_payments_view_permission(): void
    {
        [$dentist] = $this->seedLedgerRecords();
        $assistant = User::factory()->create([
            'role' => 'assistant',
            'dentist_owner_id' => $dentist->id,
            'assistant_permissions' => [User::PERMISSION_PATIENTS_VIEW],
        ]);

        $this->actingAs($assistant, 'web')
            ->getJson('/api/v1/payments/ledger/patients')
            ->assertForbidden();
    }

    /**
     * @return array{User, Patient, Patient}
     */
    private function seedLedgerRecords(): array
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $patientWithDebt = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Samira Debt',
            'phone' => '+998900000001',
            'patient_id' => 'PT-DEBT',
        ]);
        $settledPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Komil Settled',
            'phone' => '+998900000002',
            'patient_id' => 'PT-PAID',
        ]);
        $foreignPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);

        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patientWithDebt->id,
            'created_by_user_id' => $dentist->id,
            'updated_by_user_id' => $dentist->id,
            'treatment_type' => 'Root canal',
            'treatment_date' => '2026-06-15',
            'debt_amount' => 200000,
            'paid_amount' => 50000,
        ]);
        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patientWithDebt->id,
            'created_by_user_id' => $dentist->id,
            'updated_by_user_id' => $dentist->id,
            'treatment_type' => 'Advance payment',
            'treatment_date' => '2026-06-14',
            'debt_amount' => 0,
            'paid_amount' => 30000,
        ]);
        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $settledPatient->id,
            'created_by_user_id' => $dentist->id,
            'updated_by_user_id' => $dentist->id,
            'treatment_type' => 'Cleaning',
            'treatment_date' => '2026-06-13',
            'debt_amount' => 50000,
            'paid_amount' => 50000,
        ]);
        Treatment::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $foreignPatient->id,
            'debt_amount' => 999999,
            'paid_amount' => 0,
        ]);

        return [$dentist, $patientWithDebt, $settledPatient];
    }
}
