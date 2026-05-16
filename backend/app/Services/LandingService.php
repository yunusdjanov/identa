<?php

namespace App\Services;

use App\Models\LandingSetting;
use App\Models\LeadRequest;
use App\Models\Plan;
use Illuminate\Database\Eloquent\Collection;

class LandingService
{
    /**
     * @return array{settings: LandingSetting, plans: Collection<int, Plan>}
     */
    public function settingsPayload(): array
    {
        return [
            'settings' => LandingSetting::current(),
            'plans' => Plan::query()
                ->whereIn('code', Plan::CODES)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get(),
        ];
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    public function createLead(array $validated): LeadRequest
    {
        return LeadRequest::query()->create($validated);
    }
}
