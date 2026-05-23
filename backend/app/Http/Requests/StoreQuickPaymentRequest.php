<?php

namespace App\Http\Requests;

use App\Models\Payment;
use App\Models\Patient;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Mobile-friendly "quick payment" form: collects amount + method + date
 * in one shot, then the QuickPaymentService bundles invoice + payment
 * creation behind a single endpoint. See QuickPaymentController@store.
 *
 * Lives separately from StorePaymentRequest because the latter requires
 * an existing `invoice_id` — this request does NOT, since the invoice is
 * synthesized server-side from the {patient} route parameter.
 */
class StoreQuickPaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $dentistId = $this->user()?->tenantDentistId();
        $patientId = (string) $this->route('id');

        return [
            // Patient ownership check belongs in the route param. The
            // service layer will fail with a 404 if the patient doesn't
            // belong to this dentist; we add the ownership rule here too
            // so validation errors surface as 422 instead of 404 for
            // forms that submit a malformed id.
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => [
                'required',
                Rule::in([
                    Payment::METHOD_CASH,
                    Payment::METHOD_CARD,
                    Payment::METHOD_BANK_TRANSFER,
                ]),
            ],
            'payment_date' => ['required', 'date'],
            // Optional human-readable description for the auto-generated
            // invoice line. Defaults server-side to "Manual payment - <date>"
            // if blank.
            'description' => ['nullable', 'string', 'min:1', 'max:255'],
            // Optional reference to a treatment so reports can correlate
            // the payment back to clinical work. Not persisted on the
            // payment itself — used only to seed the invoice line label.
            'treatment_id' => ['nullable', 'uuid'],
            // Optional free-text note on the payment row (e.g. "Partial
            // payment, balance due next visit"). Stored in payments.notes.
            'notes' => ['nullable', 'string', 'min:1', 'max:500'],
        ] + $this->patientOwnershipRules($dentistId, $patientId);
    }

    /**
     * @return array<string, mixed>
     */
    private function patientOwnershipRules(?int $dentistId, string $patientId): array
    {
        // Express the route param ownership as a validation rule so the
        // resulting 422 has a clear field error rather than a bare 404.
        return [
            '_patient_id' => [
                Rule::exists((new Patient())->getTable(), 'id')
                    ->where(fn ($query) => $query
                        ->where('id', $patientId)
                        ->where('dentist_id', $dentistId)
                        ->whereNull('deleted_at')),
            ],
        ];
    }

    /**
     * Inject the route patient_id into validation data so the rule above
     * has something to check against. Excluded from `validated()` output
     * via prepareForValidation cleanup in the service.
     *
     * @return array<string, mixed>
     */
    protected function prepareForValidation(): void
    {
        $this->merge([
            '_patient_id' => (string) $this->route('id'),
        ]);
    }
}
