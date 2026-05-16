<?php

namespace App\Http\Resources;

use App\Models\Plan;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PlanResource extends JsonResource
{
    public function __construct(Plan $resource)
    {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Plan $plan */
        $plan = $this->resource;

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
        ];
    }
}
