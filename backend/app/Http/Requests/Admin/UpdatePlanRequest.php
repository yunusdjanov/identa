<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates the payload for `PUT /admin/plans/{code}`.
 *
 * Pure validation only — cross-entity guards (trial integrity, active subscribers,
 * currency immutability, plan-type invariants) live in PlanController so they
 * have access to the locked Plan row.
 *
 * Note: upload_max_mb and stored_image_max_mb are both per-file limits with
 * different semantics (raw upload vs. post-compression target) — they have no
 * required ordering relationship, so no cross-field invariant is enforced.
 */
class UpdatePlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Defense-in-depth — mirrors sibling admin requests
        // (StoreDentistRequest etc.). The route is already guarded by
        // `role:admin`, but a future refactor that attaches this
        // FormRequest to a non-admin route would silently authorize
        // without the explicit check.
        return $this->user()?->isAdmin() === true;
    }

    /**
     * Strip HTML and trim whitespace from text fields before validation —
     * description is rendered as plain text everywhere, so reject any markup
     * silently rather than failing validation on paste-from-email content.
     */
    protected function prepareForValidation(): void
    {
        $sanitized = [];

        if ($this->has('name') && is_string($this->input('name'))) {
            $sanitized['name'] = trim(strip_tags($this->input('name')));
        }

        if ($this->has('description')) {
            $raw = $this->input('description');
            if ($raw === null || $raw === '') {
                $sanitized['description'] = null;
            } elseif (is_string($raw)) {
                $cleaned = trim(strip_tags($raw));
                $sanitized['description'] = $cleaned === '' ? null : $cleaned;
            }
        }

        if ($sanitized !== []) {
            $this->merge($sanitized);
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'trial_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'monthly_price' => ['nullable', 'numeric', 'min:0', 'max:1000000000'],
            'yearly_price' => ['nullable', 'numeric', 'min:0', 'max:1000000000'],
            'currency' => ['required', 'string', 'size:3', Rule::in(['UZS', 'USD', 'EUR'])],
            'staff_limit' => ['required', 'integer', 'min:1', 'max:1000'],
            'entry_image_limit' => ['required', 'integer', 'min:0', 'max:100'],
            'upload_max_mb' => ['required', 'numeric', 'gt:0', 'max:100'],
            'stored_image_max_mb' => ['required', 'numeric', 'gt:0', 'max:9999.99'],
            'can_export' => ['required', 'boolean'],
            'is_active' => ['required', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:1000'],
        ];
    }
}
