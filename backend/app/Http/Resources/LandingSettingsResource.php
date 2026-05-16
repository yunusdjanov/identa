<?php

namespace App\Http\Resources;

use App\Models\LandingSetting;
use App\Models\Plan;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LandingSettingsResource extends JsonResource
{
    /**
     * @param  Collection<int, Plan>  $plans
     */
    public function __construct(
        LandingSetting $resource,
        private readonly Collection $plans,
    ) {
        parent::__construct($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var LandingSetting $settings */
        $settings = $this->resource;
        $plansByCode = $this->plans->keyBy('code');
        $basicPlan = $plansByCode->get(Plan::CODE_BASIC);
        $proPlan = $plansByCode->get(Plan::CODE_PRO);

        return [
            'trial_price_amount' => 0,
            'monthly_price_amount' => $basicPlan?->monthly_price !== null
                ? (int) $basicPlan->monthly_price
                : (int) $settings->monthly_price_amount,
            'yearly_price_amount' => $proPlan?->yearly_price !== null
                ? (int) $proPlan->yearly_price
                : (int) $settings->yearly_price_amount,
            'currency' => $basicPlan?->currency ?? $proPlan?->currency ?? $settings->currency,
            'telegram_contact_url' => $settings->telegram_contact_url,
            'plans' => $this->plans
                ->map(fn (Plan $plan): array => (new PlanResource($plan))->resolve($request))
                ->values()
                ->all(),
        ];
    }
}
