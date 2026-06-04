<?php

namespace App\Services;

use App\Http\Requests\StoreQuickPaymentRequest;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Patient;
use App\Models\Payment;
use App\Models\Treatment;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * "Quick payment" flow used by the mobile app.
 *
 * Backend's canonical model is Invoice → Payment, but the mobile UI
 * doesn't expose Invoices as a separate concept — the user just records
 * a payment against a Treatment / Patient. This service bridges the two:
 *
 *   1. Locates (or creates) a single-line Invoice owned by this dentist,
 *      for this patient, sized to the payment amount.
 *   2. Creates a Payment linked to that Invoice.
 *   3. Updates Invoice paid_amount / balance / status atomically.
 *
 * The invoice description defaults to "Manual payment - <date>" but the
 * mobile can pass `description` (the treatment type label is a sensible
 * value, surfaced via `treatment_id` if the caller wants).
 *
 * Reuses the helper logic in InvoiceService / PaymentService — see
 * `generateInvoiceNumber`-style helpers there. We deliberately keep this
 * service narrow so the two existing flows continue working unchanged.
 */
class QuickPaymentService
{
    public function create(StoreQuickPaymentRequest $request): Payment
    {
        $validated = $request->validated();
        $dentistId = $this->dentistId($request);
        $patientId = (string) $request->route('id');

        return DB::transaction(function () use ($validated, $dentistId, $patientId): Payment {
            // Ownership check at the data layer too — even though the
            // request validator already gates this, the service layer
            // should stand on its own for callers that bypass the form
            // request (queue jobs, console commands, etc.).
            /** @var Patient $patient */
            $patient = Patient::query()
                ->where('id', $patientId)
                ->where('dentist_id', $dentistId)
                ->firstOrFail();

            $amount = $this->normalizeMoney($validated['amount']);
            $paymentDate = (string) $validated['payment_date'];
            $description = isset($validated['description']) && is_string($validated['description'])
                && trim($validated['description']) !== ''
                ? trim($validated['description'])
                : sprintf('Manual payment - %s', $paymentDate);

            // If the mobile passed a treatment_id, mirror the payment onto
            // the Treatment row's paid_amount / balance counters so the
            // treatment list reflects the new balance immediately.
            //
            // We keep Treatments and Invoices/Payments as separate models
            // (matching the web frontend's domain), but the mobile UI
            // models payments per-treatment, so we eagerly maintain both
            // views. Lock the row so concurrent payment recordings don't
            // race.
            $treatment = null;
            if (isset($validated['treatment_id']) && is_string($validated['treatment_id'])) {
                /** @var Treatment|null $treatment */
                $treatment = Treatment::query()
                    ->where('id', $validated['treatment_id'])
                    ->where('dentist_id', $dentistId)
                    ->where('patient_id', $patient->id)
                    ->lockForUpdate()
                    ->first();
                if ($treatment === null) {
                    // The caller supplied a treatment_id that doesn't
                    // belong to this dentist + patient. Previous behaviour
                    // silently fell back to "no mirror" — which also
                    // skipped the balance-exceeded guard below, letting a
                    // misuser send an arbitrary amount with an unowned
                    // UUID. Refuse the request outright so the boundary
                    // stays tight.
                    throw ValidationException::withMessages([
                        'treatment_id' => [__('api.treatments.not_found')],
                    ]);
                }
                $debt = $this->normalizeMoney($treatment->debt_amount ?? $treatment->cost ?? '0');
                $alreadyPaid = $this->normalizeMoney($treatment->paid_amount ?? '0');
                $remaining = bcsub($debt, $alreadyPaid, 2);
                if (bccomp($amount, $remaining, 2) === 1) {
                    throw ValidationException::withMessages([
                        'amount' => [__('api.payments.amount_exceeds_balance')],
                    ]);
                }
            }

            // Synthesize a single-line invoice sized exactly to the
            // amount. status defaults to UNPAID; we flip to PAID after
            // recording the payment below.
            $invoice = Invoice::create([
                'dentist_id' => $dentistId,
                'patient_id' => $patient->id,
                'invoice_number' => $this->generateInvoiceNumber($dentistId),
                'invoice_date' => $paymentDate,
                'due_date' => null,
                'total_amount' => $amount,
                'paid_amount' => '0.00',
                'balance' => $amount,
                'status' => Invoice::STATUS_UNPAID,
                'notes' => null,
            ]);

            // One synthetic invoice line. Items must sum to total_amount
            // server-side; with quantity=1 and unit_price=amount we get
            // exact match.
            InvoiceItem::create([
                'invoice_id' => $invoice->id,
                'odontogram_entry_id' => null,
                'description' => $description,
                'quantity' => 1,
                'unit_price' => $amount,
                'total_price' => $amount,
                'sort_order' => 0,
            ]);

            // Now record the payment. We don't go through PaymentService
            // here because we already locked / hold the invoice in this
            // transaction; calling out would re-acquire the lock and
            // route through StorePaymentRequest validation that we've
            // already done.
            $payment = Payment::create([
                'dentist_id' => $dentistId,
                'patient_id' => $patient->id,
                'invoice_id' => $invoice->id,
                'amount' => $amount,
                'payment_method' => $validated['payment_method'],
                'payment_date' => $paymentDate,
                'notes' => isset($validated['notes']) && is_string($validated['notes'])
                    && trim($validated['notes']) !== ''
                    ? trim($validated['notes'])
                    : null,
            ]);

            // Reflect the payment on the invoice. Since the invoice was
            // sized to amount, it's now fully paid.
            $invoice->update([
                'paid_amount' => $amount,
                'balance' => '0.00',
                'status' => Invoice::STATUS_PAID,
            ]);

            // Mirror onto the treatment row if one was referenced. Already
            // validated against remaining balance above; just persist.
            if ($treatment !== null) {
                $newPaid = bcadd($this->normalizeMoney($treatment->paid_amount ?? '0'), $amount, 2);
                $treatment->update([
                    'paid_amount' => $newPaid,
                ]);
            }

            return $payment;
        });
    }

    public function dentistId(Request $request): int
    {
        /** @var User|null $actor */
        $actor = $request->user();
        $dentistId = $actor?->tenantDentistId();
        abort_if($dentistId === null, 403);

        return $dentistId;
    }

    private function normalizeMoney(mixed $value): string
    {
        return number_format((float) $value, 2, '.', '');
    }

    /**
     * Mirrors InvoiceService::generateInvoiceNumber so the synthesized
     * invoice fits in the existing numbering scheme (INV-YYMM-NNNN).
     * Duplicated rather than extracted into a shared helper because the
     * scope is small and the two services are otherwise independent —
     * extracting would add coupling for marginal reuse.
     */
    private function generateInvoiceNumber(int $dentistId): string
    {
        $prefix = 'INV-'.now()->format('ym').'-';

        $existingNumbers = Invoice::query()
            ->where('dentist_id', $dentistId)
            ->where('invoice_number', 'like', $prefix.'%')
            ->lockForUpdate()
            ->pluck('invoice_number');

        $maxSequence = 0;
        foreach ($existingNumbers as $invoiceNumber) {
            $sequence = (int) substr((string) $invoiceNumber, strlen($prefix));
            $maxSequence = max($maxSequence, $sequence);
        }

        return $prefix.str_pad((string) ($maxSequence + 1), 4, '0', STR_PAD_LEFT);
    }
}
