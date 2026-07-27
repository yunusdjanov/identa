<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnalyticsSummaryApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_summary_aggregates_metrics_without_double_counting_visits(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'created_at' => '2026-06-10 09:00:00',
            'updated_at' => '2026-06-10 09:00:00',
        ]);

        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'treatment_date' => '2026-06-10',
            'debt_amount' => '500.00',
            'paid_amount' => '200.00',
        ]);
        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'treatment_date' => '2026-06-09',
            'debt_amount' => '100.00',
            'paid_amount' => '50.00',
        ]);
        Appointment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => '2026-06-10',
            'status' => Appointment::STATUS_COMPLETED,
        ]);
        Appointment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'appointment_date' => '2026-06-10',
            'start_time' => '12:00',
            'end_time' => '12:30',
            'status' => Appointment::STATUS_SCHEDULED,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/analytics/summary?'.http_build_query([
                'range' => '7d',
                'current_from' => '2026-06-10',
                'current_to' => '2026-06-10',
                'previous_from' => '2026-06-09',
                'previous_to' => '2026-06-09',
            ]))
            ->assertOk()
            ->assertJsonPath('data.currency', Treatment::CURRENCY_UZS)
            ->assertJsonPath('data.kpis.revenue.current', 200)
            ->assertJsonPath('data.kpis.revenue.previous', 50)
            ->assertJsonPath('data.kpis.debt.current', 350)
            ->assertJsonPath('data.kpis.patients.current', 1)
            ->assertJsonPath('data.kpis.visits.current', 1)
            ->assertJsonPath('data.kpis.visits.previous', 1)
            ->assertJsonPath('data.appointment_status.0.status', Appointment::STATUS_SCHEDULED)
            ->assertJsonPath('data.appointment_status.0.count', 1)
            ->assertJsonPath('data.appointment_status.1.status', Appointment::STATUS_COMPLETED)
            ->assertJsonPath('data.appointment_status.1.count', 1)
            ->assertJsonPath('data.top_debtors.0.name', $patient->full_name)
            ->assertJsonPath('data.top_debtors.0.debt', 300);
    }

    public function test_dentist_summary_keeps_financial_metrics_separate_by_currency(): void
    {
        $dentist = User::factory()->create();
        $usdPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'USD Patient',
        ]);
        $uzsPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'UZS Patient',
        ]);

        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $usdPatient->id,
            'treatment_date' => '2026-06-10',
            'debt_amount' => '100.00',
            'paid_amount' => '40.00',
            'currency' => Treatment::CURRENCY_USD,
        ]);
        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $usdPatient->id,
            'treatment_date' => '2026-06-09',
            'debt_amount' => '20.00',
            'paid_amount' => '20.00',
            'currency' => Treatment::CURRENCY_USD,
        ]);
        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $uzsPatient->id,
            'treatment_date' => '2026-06-10',
            'debt_amount' => '100000.00',
            'paid_amount' => '40000.00',
            'currency' => Treatment::CURRENCY_UZS,
        ]);

        $otherDentist = User::factory()->create();
        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);
        Treatment::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
            'treatment_date' => '2026-06-10',
            'debt_amount' => '9999.00',
            'paid_amount' => '9999.00',
            'currency' => Treatment::CURRENCY_USD,
        ]);

        $baseQuery = [
            'range' => '7d',
            'current_from' => '2026-06-10',
            'current_to' => '2026-06-10',
            'previous_from' => '2026-06-09',
            'previous_to' => '2026-06-09',
        ];

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/analytics/summary?'.http_build_query([
                ...$baseQuery,
                'currency' => Treatment::CURRENCY_USD,
            ]))
            ->assertOk()
            ->assertJsonPath('data.currency', Treatment::CURRENCY_USD)
            ->assertJsonPath('data.kpis.revenue.current', 40)
            ->assertJsonPath('data.kpis.revenue.previous', 20)
            ->assertJsonPath('data.kpis.debt.current', 60)
            ->assertJsonPath('data.kpis.visits.current', 2)
            ->assertJsonPath('data.kpis.visits.previous', 1)
            ->assertJsonPath('data.buckets.0.revenue', 40)
            ->assertJsonPath('data.buckets.0.debt', 60)
            ->assertJsonPath('data.top_debtors.0.name', 'USD Patient')
            ->assertJsonPath('data.top_debtors.0.debt', 60);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/analytics/summary?'.http_build_query([
                ...$baseQuery,
                'currency' => Treatment::CURRENCY_UZS,
            ]))
            ->assertOk()
            ->assertJsonPath('data.currency', Treatment::CURRENCY_UZS)
            ->assertJsonPath('data.kpis.revenue.current', 40000)
            ->assertJsonPath('data.kpis.revenue.previous', 0)
            ->assertJsonPath('data.kpis.debt.current', 60000)
            ->assertJsonPath('data.kpis.visits.current', 2)
            ->assertJsonPath('data.top_debtors.0.name', 'UZS Patient')
            ->assertJsonPath('data.top_debtors.0.debt', 60000);
    }

    public function test_dentist_summary_rejects_unsupported_currency(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/analytics/summary?'.http_build_query([
                'range' => '7d',
                'current_from' => '2026-06-10',
                'current_to' => '2026-06-10',
                'previous_from' => '2026-06-09',
                'previous_to' => '2026-06-09',
                'currency' => 'EUR',
            ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('currency');
    }

    public function test_dentist_summary_rejects_unbounded_or_overlapping_periods(): void
    {
        $dentist = User::factory()->create();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/analytics/summary?'.http_build_query([
                'range' => '7d',
                'current_from' => '2026-01-01',
                'current_to' => '2026-06-30',
                'previous_from' => '1900-01-01',
                'previous_to' => '2025-12-31',
            ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['current_to', 'previous_to', 'previous_from']);

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/analytics/summary?'.http_build_query([
                'range' => '7d',
                'current_from' => '2026-06-10',
                'current_to' => '2026-06-16',
                'previous_from' => '2026-06-09',
                'previous_to' => '2026-06-10',
            ]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['previous_to']);
    }

    public function test_admin_summary_endpoint_returns_empty_state_for_admins(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin, 'web')
            ->getJson('/api/v1/admin/analytics/summary?'.http_build_query([
                'range' => '30d',
                'current_from' => '2026-06-01',
                'current_to' => '2026-06-30',
                'previous_from' => '2026-05-02',
                'previous_to' => '2026-05-31',
            ]))
            ->assertOk()
            ->assertJsonPath('data.kpis.active_dentists.current', 0)
            ->assertJsonPath('data.kpis.mrr.currency', 'UZS')
            ->assertJsonStructure([
                'data' => [
                    'kpis' => [
                        'active_dentists' => ['current', 'previous'],
                        'mrr' => ['current', 'previous', 'currency'],
                        'signups' => ['current', 'previous'],
                        'conversion' => ['current', 'previous'],
                    ],
                    'signup_growth',
                    'subscription_health',
                ],
            ]);
    }

    public function test_dentist_summary_limits_top_debtors_to_four_largest_balances(): void
    {
        $dentist = User::factory()->create();
        $debts = [
            'Patient 1' => 100,
            'Patient 2' => 500,
            'Patient 3' => 300,
            'Patient 4' => 200,
            'Patient 5' => 400,
        ];

        foreach ($debts as $name => $debt) {
            $patient = Patient::factory()->create([
                'dentist_id' => $dentist->id,
                'full_name' => $name,
            ]);

            Treatment::factory()->create([
                'dentist_id' => $dentist->id,
                'patient_id' => $patient->id,
                'treatment_date' => '2026-06-10',
                'debt_amount' => (string) $debt,
                'paid_amount' => '0.00',
            ]);
        }

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/analytics/summary?'.http_build_query([
                'range' => '7d',
                'current_from' => '2026-06-10',
                'current_to' => '2026-06-10',
                'previous_from' => '2026-06-09',
                'previous_to' => '2026-06-09',
            ]))
            ->assertOk()
            ->assertJsonCount(4, 'data.top_debtors')
            ->assertJsonPath('data.top_debtors.0.name', 'Patient 2')
            ->assertJsonPath('data.top_debtors.1.name', 'Patient 5')
            ->assertJsonPath('data.top_debtors.2.name', 'Patient 3')
            ->assertJsonPath('data.top_debtors.3.name', 'Patient 4');
    }
}
