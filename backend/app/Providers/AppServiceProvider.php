<?php

namespace App\Providers;

use App\Models\Appointment;
use App\Models\AuditLog;
use App\Models\Invoice;
use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\PatientCategory;
use App\Models\Payment;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use App\Policies\TenantOwnedPolicy;
use App\Services\Media\AntivirusScanner;
use App\Services\Media\ClamAvAntivirusScanner;
use App\Services\Media\NullAntivirusScanner;
use App\Support\ProductionRuntimePolicyValidator;
use App\Support\ProductionSecretsValidator;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(AntivirusScanner::class, function () {
            $driver = (string) config('media-security.antivirus.driver', 'null');

            if ($driver === 'clamav') {
                return new ClamAvAntivirusScanner(
                    host: (string) config('media-security.antivirus.clamav.host', '127.0.0.1'),
                    port: (int) config('media-security.antivirus.clamav.port', 3310),
                    timeout: (float) config('media-security.antivirus.clamav.timeout', 10),
                );
            }

            return new NullAntivirusScanner;
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (! $this->shouldSkipProductionGuardsForConsoleCommand()) {
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
        }

        ResetPassword::createUrlUsing(function (User $user, string $token): string {
            $frontendUrl = rtrim((string) env('FRONTEND_URL', 'http://localhost:3000'), '/');

            return sprintf(
                '%s/reset-password?token=%s&email=%s',
                $frontendUrl,
                urlencode($token),
                urlencode((string) $user->email)
            );
        });

        Gate::define('admin-access', fn (User $user): bool => $user->isAdmin());
        Gate::define('dentist-access', fn (User $user): bool => $user->isDentist());

        Gate::policy(Appointment::class, TenantOwnedPolicy::class);
        Gate::policy(AuditLog::class, TenantOwnedPolicy::class);
        Gate::policy(Invoice::class, TenantOwnedPolicy::class);
        Gate::policy(OdontogramEntry::class, TenantOwnedPolicy::class);
        Gate::policy(OdontogramEntryImage::class, TenantOwnedPolicy::class);
        Gate::policy(Patient::class, TenantOwnedPolicy::class);
        Gate::policy(PatientCategory::class, TenantOwnedPolicy::class);
        Gate::policy(Payment::class, TenantOwnedPolicy::class);
        Gate::policy(Treatment::class, TenantOwnedPolicy::class);
        Gate::policy(TreatmentImage::class, TenantOwnedPolicy::class);
    }

    private function shouldSkipProductionGuardsForConsoleCommand(): bool
    {
        if (! $this->app->runningInConsole()) {
            return false;
        }

        return in_array($_SERVER['argv'][1] ?? '', ['package:discover', 'test'], true);
    }
}
