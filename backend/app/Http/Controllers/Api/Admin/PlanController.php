<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Plan;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PlanController extends Controller
{
    public function __construct(
        private readonly AuditLogger $auditLogger,
    ) {
    }

    public function index(): JsonResponse
    {
        $plans = Plan::query()
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $plans->map(fn (Plan $plan): array => $this->transformPlan($plan))->values()->all(),
        ]);
    }

    public function update(Request $request, string $code): JsonResponse
    {
        if (! in_array($code, Plan::CODES, true)) {
            abort(404);
        }

        /** @var Plan $plan */
        $plan = Plan::query()->where('code', $code)->firstOrFail();
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'trial_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'monthly_price' => ['nullable', 'numeric', 'min:0'],
            'yearly_price' => ['nullable', 'numeric', 'min:0'],
            'currency' => ['required', 'string', 'size:3'],
            'staff_limit' => ['required', 'integer', 'min:0', 'max:1000'],
            'entry_image_limit' => ['required', 'integer', 'min:0', 'max:100'],
            'upload_max_mb' => ['required', 'numeric', 'gt:0', 'max:100'],
            'stored_image_max_mb' => ['required', 'numeric', 'gt:0', 'max:100'],
            'can_export' => ['required', 'boolean'],
            'is_active' => ['required', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:1000'],
        ]);

        if ((float) $validated['stored_image_max_mb'] > (float) $validated['upload_max_mb']) {
            throw ValidationException::withMessages([
                'stored_image_max_mb' => ['Stored image max MB must be less than or equal to upload max MB.'],
            ]);
        }

        if ($plan->code === Plan::CODE_TRIAL) {
            $validated['is_trial'] = true;
            $validated['is_paid'] = false;
            $validated['monthly_price'] = 0;
            $validated['yearly_price'] = 0;
            $validated['trial_days'] = $validated['trial_days'] ?? 30;
        } else {
            $validated['is_trial'] = false;
            $validated['is_paid'] = true;
            $validated['trial_days'] = null;

            if (! isset($validated['monthly_price']) || (float) $validated['monthly_price'] <= 0) {
                throw ValidationException::withMessages([
                    'monthly_price' => ['Monthly price is required for paid plans.'],
                ]);
            }

            if (! isset($validated['yearly_price']) || (float) $validated['yearly_price'] <= 0) {
                throw ValidationException::withMessages([
                    'yearly_price' => ['Yearly price is required for paid plans.'],
                ]);
            }
        }

        $before = $plan->only([
            'name',
            'description',
            'trial_days',
            'monthly_price',
            'yearly_price',
            'currency',
            'staff_limit',
            'entry_image_limit',
            'upload_max_mb',
            'stored_image_max_mb',
            'can_export',
            'is_active',
            'sort_order',
        ]);

        $plan->update($validated);

        $this->auditLogger->logFromRequest(
            request: $request,
            eventType: 'admin.plan.updated',
            entityType: 'plan',
            entityId: (string) $plan->id,
            metadata: [
                'code' => $plan->code,
                'before' => $before,
                'after' => $plan->fresh()?->only(array_keys($before)),
            ],
        );

        return response()->json([
            'data' => $this->transformPlan($plan->fresh()),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function transformPlan(Plan $plan): array
    {
        return [
            'id' => (string) $plan->id,
            'code' => $plan->code,
            'name' => $plan->name,
            'description' => $plan->description,
            'is_trial' => (bool) $plan->is_trial,
            'is_paid' => (bool) $plan->is_paid,
            'trial_days' => $plan->trial_days,
            'monthly_price' => $plan->monthly_price !== null ? (float) $plan->monthly_price : null,
            'yearly_price' => $plan->yearly_price !== null ? (float) $plan->yearly_price : null,
            'currency' => $plan->currency,
            'staff_limit' => (int) $plan->staff_limit,
            'entry_image_limit' => (int) $plan->entry_image_limit,
            'upload_max_mb' => (float) $plan->upload_max_mb,
            'stored_image_max_mb' => (float) $plan->stored_image_max_mb,
            'can_export' => (bool) $plan->can_export,
            'is_active' => (bool) $plan->is_active,
            'sort_order' => (int) $plan->sort_order,
            'updated_at' => $plan->updated_at?->toIso8601String(),
        ];
    }
}
