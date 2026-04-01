<?php

namespace Tests\Unit;

use App\Support\ProductionSecretsValidator;
use RuntimeException;
use Tests\TestCase;

class ProductionSecretsValidatorTest extends TestCase
{
    public function test_find_production_issues_returns_empty_for_valid_configuration(): void
    {
        config()->set('app.key', 'base64:'.base64_encode(str_repeat('A', 32)));
        config()->set('database.default', 'pgsql');
        config()->set('database.connections.pgsql', [
            'driver' => 'pgsql',
            'password' => 'StrongP@ssw0rd!2026',
        ]);
        config()->set('secrets.additional_required', ['SENTRY_LARAVEL_DSN']);
        $_SERVER['SENTRY_LARAVEL_DSN'] = 'https://examplePublicKey@o0.ingest.sentry.io/0';

        $validator = app(ProductionSecretsValidator::class);
        $this->assertSame([], $validator->findProductionIssues());
    }

    public function test_find_production_issues_flags_weak_app_key_and_db_password(): void
    {
        config()->set('app.key', 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
        config()->set('database.default', 'pgsql');
        config()->set('database.connections.pgsql', [
            'driver' => 'pgsql',
            'password' => 'secret',
        ]);
        config()->set('secrets.additional_required', []);

        $validator = app(ProductionSecretsValidator::class);
        $issues = $validator->findProductionIssues();

        $this->assertNotEmpty($issues);
        $this->assertTrue(
            collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'APP_KEY'))
        );
        $this->assertTrue(
            collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'DB_PASSWORD'))
        );
    }

    public function test_assert_production_secrets_or_fail_throws_for_invalid_configuration(): void
    {
        config()->set('app.key', '');
        config()->set('database.default', 'pgsql');
        config()->set('database.connections.pgsql', [
            'driver' => 'pgsql',
            'password' => '',
        ]);
        config()->set('secrets.additional_required', []);

        $validator = app(ProductionSecretsValidator::class);

        $this->expectException(RuntimeException::class);
        $validator->assertProductionSecretsOrFail();
    }

    public function test_find_production_issues_requires_sentry_dsn_when_enabled(): void
    {
        config()->set('app.key', 'base64:'.base64_encode(str_repeat('A', 32)));
        config()->set('database.default', 'pgsql');
        config()->set('database.connections.pgsql', [
            'driver' => 'pgsql',
            'password' => 'StrongP@ssw0rd!2026',
        ]);
        config()->set('secrets.additional_required', []);
        config()->set('secrets.require_sentry_dsn', true);
        config()->set('sentry.dsn', '');

        $validator = app(ProductionSecretsValidator::class);
        $issues = $validator->findProductionIssues();

        $this->assertTrue(
            collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'SENTRY_LARAVEL_DSN'))
        );
    }
}
