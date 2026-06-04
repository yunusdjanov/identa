<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ManageDentistSubscriptionRequest extends FormRequest
{
    /**
     * Actions that record a real money receipt and therefore demand the
     * payment_method + payment_amount fields. The pure-state actions
     * (mark_*, cancel_*, set_trial) intentionally accept neither.
     *
     * @var list<string>
     */
    private const PAID_ACTIONS = [
        'apply_monthly',
        'apply_yearly',
        'activate_monthly',
        'activate_yearly',
        'extend_monthly',
        'extend_yearly',
        'set_basic_monthly',
        'set_basic_yearly',
        'set_pro_monthly',
        'set_pro_yearly',
    ];

    public function authorize(): bool
    {
        // Defense-in-depth: route middleware already enforces role:admin,
        // but a future routing change could accidentally expose this. Verify
        // the actor is an authenticated admin before the controller mutates
        // financial state.
        $user = $this->user();
        return $user !== null && method_exists($user, 'isAdmin') && $user->isAdmin();
    }

    /**
     * Strip HTML and trim whitespace from the free-form note. The note is
     * persisted to users.subscription_note AND bubbles into audit-log
     * metadata + subscription summary surfaces — sanitizing here matches
     * UpdatePlanRequest's defensive treatment.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('note')) {
            $raw = $this->input('note');
            if ($raw === null || $raw === '') {
                $this->merge(['note' => null]);
            } elseif (is_string($raw)) {
                $cleaned = trim(strip_tags($raw));
                $this->merge(['note' => $cleaned === '' ? null : $cleaned]);
            }
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $paidActions = implode(',', self::PAID_ACTIONS);

        return [
            'action' => [
                'required',
                'string',
                Rule::in([
                    ...self::PAID_ACTIONS,
                    'set_trial',
                    'mark_read_only',
                    'mark_active',
                    'cancel_at_period_end',
                    'cancel_now',
                ]),
            ],

            // Required only when the action actually records a payment.
            // 'cash', 'p2p', and 'bank_transfer' are the three off-line
            // receipt channels admins use; PayX flows go through the
            // checkout endpoint, not this controller.
            'payment_method' => [
                "required_if:action,{$paidActions}",
                'nullable',
                'string',
                Rule::in(['cash', 'p2p', 'bank_transfer']),
            ],

            // payment_amount must be strictly positive on paid actions —
            // amount=0 with method='cash' would otherwise activate a paid
            // plan for free while still leaving a "I received 0 cash" paper
            // trail, which is indistinguishable from a real receipt to
            // downstream reconciliation. Upper bound caps obvious admin
            // typos / compromised-account abuse.
            'payment_amount' => [
                "required_if:action,{$paidActions}",
                'nullable',
                'numeric',
                'gt:0',
                'max:1000000000',
            ],

            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
