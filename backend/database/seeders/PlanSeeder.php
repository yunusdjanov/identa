<?php

namespace Database\Seeders;

use App\Models\Plan;
use Illuminate\Database\Seeder;

/**
 * Essential reference data: the subscription plan catalogue.
 *
 * Unlike the demo fixtures in DatabaseSeeder, this is data the live
 * application genuinely needs to function (landing pricing, checkout,
 * staff limits), so it is safe — and intended — to run in production:
 *
 *   php artisan db:seed --class=Database\\Seeders\\PlanSeeder --force
 *
 * Idempotent via updateOrCreate on the unique `code`, so re-running only
 * upserts and never duplicates.
 */
class PlanSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            [
                'code' => Plan::CODE_TRIAL,
                'name' => 'Trial',
                'description' => '30 kunlik sinov tarifi',
                'is_trial' => true,
                'is_paid' => false,
                'trial_days' => 30,
                'monthly_price' => null,
                'yearly_price' => null,
                'currency' => 'UZS',
                'staff_limit' => 1,
                'entry_image_limit' => 2,
                'upload_max_mb' => 3,
                'stored_image_max_mb' => 6,
                'can_export' => false,
                'is_active' => true,
                'sort_order' => 10,
            ],
            [
                'code' => Plan::CODE_BASIC,
                'name' => 'Basic',
                'description' => 'Kichik klinikalar uchun asosiy tarif',
                'is_trial' => false,
                'is_paid' => true,
                'trial_days' => null,
                'monthly_price' => 120000,
                'yearly_price' => 1200000,
                'currency' => 'UZS',
                'staff_limit' => 3,
                'entry_image_limit' => 5,
                'upload_max_mb' => 5,
                'stored_image_max_mb' => 25,
                'can_export' => false,
                'is_active' => true,
                'sort_order' => 20,
            ],
            [
                'code' => Plan::CODE_PRO,
                'name' => 'Pro',
                'description' => 'Kengaytirilgan limitlar va export',
                'is_trial' => false,
                'is_paid' => true,
                'trial_days' => null,
                'monthly_price' => 200000,
                'yearly_price' => 2000000,
                'currency' => 'UZS',
                'staff_limit' => 5,
                'entry_image_limit' => 10,
                'upload_max_mb' => 8,
                'stored_image_max_mb' => 80,
                'can_export' => true,
                'is_active' => true,
                'sort_order' => 30,
            ],
        ];

        foreach ($plans as $plan) {
            Plan::query()->updateOrCreate(['code' => $plan['code']], $plan);
        }
    }
}
