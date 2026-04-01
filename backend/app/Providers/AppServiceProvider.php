<?php

namespace App\Providers;

use App\Models\User;
use App\Support\ProductionRuntimePolicyValidator;
use App\Support\ProductionSecretsValidator;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /** @var ProductionSecretsValidator $secretValidator */
        $secretValidator = app(ProductionSecretsValidator::class);
        if ($secretValidator->shouldEnforceAtRuntime()) {
            $secretValidator->assertProductionSecretsOrFail();
        }

        /** @var ProductionRuntimePolicyValidator $runtimePolicyValidator */
        $runtimePolicyValidator = app(ProductionRuntimePolicyValidator::class);
        if ($runtimePolicyValidator->shouldEnforceAtRuntime()) {
            $runtimePolicyValidator->assertProductionPolicyOrFail();
        }

        Gate::define('admin-access', fn (User $user): bool => $user->isAdmin());
        Gate::define('dentist-access', fn (User $user): bool => $user->isDentist());
    }
}
