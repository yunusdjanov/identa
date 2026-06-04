<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LandingPlansApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_landing_plans_endpoint_is_public_and_returns_active_plans(): void
    {
        $response = $this->getJson('/api/v1/landing/plans')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    [
                        'code',
                        'name',
                        'staff_limit',
                        'entry_image_limit',
                        'upload_max_mb',
                        'can_export',
                        'trial_days',
                        'monthly_price',
                        'yearly_price',
                        'currency',
                        'is_active',
                        'sort_order',
                    ],
                ],
            ]);

        $plans = collect($response->json('data'));
        $codes = $plans->pluck('code')->all();

        $this->assertContains('trial', $codes);
        $this->assertContains('basic', $codes);
        $this->assertContains('pro', $codes);

        // Only active plans are exposed.
        $plans->each(fn (array $plan) => $this->assertTrue($plan['is_active']));
    }
}
