<?php

namespace Tests\Unit;

use App\Support\ProductionRuntimePolicyValidator;
use RuntimeException;
use Tests\TestCase;

class ProductionRuntimePolicyValidatorTest extends TestCase
{
    private ?string $originalTrustedProxies = null;

    protected function setUp(): void
    {
        parent::setUp();

        $this->originalTrustedProxies = getenv('TRUSTED_PROXIES') === false
            ? null
            : (string) getenv('TRUSTED_PROXIES');
    }

    protected function tearDown(): void
    {
        if ($this->originalTrustedProxies === null) {
            putenv('TRUSTED_PROXIES');
            unset($_SERVER['TRUSTED_PROXIES']);
        } else {
            putenv('TRUSTED_PROXIES='.$this->originalTrustedProxies);
            $_SERVER['TRUSTED_PROXIES'] = $this->originalTrustedProxies;
        }

        parent::tearDown();
    }

    public function test_find_production_issues_returns_empty_for_valid_runtime_policy(): void
    {
        config()->set('app.url', 'https://api.identa.test');
        config()->set('app.frontend_url', 'https://identa.test');
        config()->set('cors.allowed_origins', ['https://identa.test']);
        config()->set('session.secure', true);
        config()->set('session.driver', 'database');
        config()->set('security.headers.hsts_enabled', true);
        config()->set('sanctum.stateful', ['identa.test']);
        config()->set('security.runtime.require_https_app_url', true);
        config()->set('security.runtime.require_https_frontend_url', true);
        config()->set('security.runtime.require_session_secure_cookie', true);
        config()->set('security.runtime.require_database_session_driver', true);
        config()->set('security.runtime.require_hsts', true);
        config()->set('security.runtime.require_sanctum_stateful_domains', true);
        config()->set('security.runtime.require_trusted_proxies', true);
        config()->set('security.runtime.require_private_media_disk', true);
        config()->set('security.runtime.require_media_finalize_verification', true);
        config()->set('filesystems.media_disk', 'r2');
        config()->set('filesystems.disks.r2.driver', 's3');
        config()->set('filesystems.verify_direct_uploads_on_finalize', true);

        putenv('TRUSTED_PROXIES=10.0.0.0/8');
        $_SERVER['TRUSTED_PROXIES'] = '10.0.0.0/8';

        $validator = app(ProductionRuntimePolicyValidator::class);
        $this->assertSame([], $validator->findProductionIssues());
    }

    public function test_find_production_issues_flags_missing_runtime_controls(): void
    {
        config()->set('app.url', 'http://localhost:8000');
        config()->set('app.frontend_url', 'http://localhost:3000');
        config()->set('cors.allowed_origins', ['http://localhost:3000']);
        config()->set('session.secure', false);
        config()->set('session.driver', 'array');
        config()->set('security.headers.hsts_enabled', false);
        config()->set('sanctum.stateful', ['localhost:3000']);
        config()->set('security.runtime.require_https_app_url', true);
        config()->set('security.runtime.require_https_frontend_url', true);
        config()->set('security.runtime.require_session_secure_cookie', true);
        config()->set('security.runtime.require_database_session_driver', true);
        config()->set('security.runtime.require_hsts', true);
        config()->set('security.runtime.require_sanctum_stateful_domains', true);
        config()->set('security.runtime.require_trusted_proxies', true);
        config()->set('security.runtime.require_private_media_disk', true);
        config()->set('security.runtime.require_media_finalize_verification', true);
        config()->set('filesystems.media_disk', 'local');
        config()->set('filesystems.disks.local.driver', 'local');
        config()->set('filesystems.verify_direct_uploads_on_finalize', false);

        putenv('TRUSTED_PROXIES');
        unset($_SERVER['TRUSTED_PROXIES']);

        $validator = app(ProductionRuntimePolicyValidator::class);
        $issues = $validator->findProductionIssues();

        $this->assertNotEmpty($issues);
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'APP_URL')));
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'FRONTEND_URL')));
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'SESSION_SECURE_COOKIE')));
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'SESSION_DRIVER')));
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'SECURITY_HSTS_ENABLED')));
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'SANCTUM_STATEFUL_DOMAINS')));
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'TRUSTED_PROXIES')));
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'MEDIA_DISK')));
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'MEDIA_VERIFY_DIRECT_UPLOADS_ON_FINALIZE')));
    }

    public function test_assert_production_policy_or_fail_throws_for_invalid_configuration(): void
    {
        config()->set('app.url', 'http://localhost:8000');
        config()->set('app.frontend_url', 'http://localhost:3000');
        config()->set('cors.allowed_origins', ['http://localhost:3000']);
        config()->set('session.secure', false);
        config()->set('session.driver', 'array');
        config()->set('security.headers.hsts_enabled', false);
        config()->set('sanctum.stateful', []);
        config()->set('security.runtime.require_https_app_url', true);
        config()->set('security.runtime.require_https_frontend_url', true);
        config()->set('security.runtime.require_session_secure_cookie', true);
        config()->set('security.runtime.require_database_session_driver', true);
        config()->set('security.runtime.require_hsts', true);
        config()->set('security.runtime.require_sanctum_stateful_domains', true);
        config()->set('security.runtime.require_trusted_proxies', true);

        putenv('TRUSTED_PROXIES');
        unset($_SERVER['TRUSTED_PROXIES']);

        $validator = app(ProductionRuntimePolicyValidator::class);

        $this->expectException(RuntimeException::class);
        $validator->assertProductionPolicyOrFail();
    }

    public function test_find_production_issues_rejects_frontend_origin_contract_drift(): void
    {
        config()->set('app.url', 'https://api.identa.test');
        config()->set('app.frontend_url', 'https://identa.test,https://preview.identa.test');
        config()->set('cors.allowed_origins', ['https://other.identa.test', 'http://preview.identa.test']);
        config()->set('sanctum.stateful', ['other.identa.test']);
        config()->set('security.runtime.require_https_app_url', true);
        config()->set('security.runtime.require_https_frontend_url', true);
        config()->set('security.runtime.require_session_secure_cookie', false);
        config()->set('security.runtime.require_database_session_driver', false);
        config()->set('security.runtime.require_hsts', false);
        config()->set('security.runtime.require_sanctum_stateful_domains', false);
        config()->set('security.runtime.require_trusted_proxies', false);
        config()->set('security.runtime.require_private_media_disk', false);
        config()->set('security.runtime.require_media_finalize_verification', false);

        $issues = app(ProductionRuntimePolicyValidator::class)->findProductionIssues();

        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'CORS frontend origins')));
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'CORS allow-list')));
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'every FRONTEND_URL host')));
    }

    public function test_find_production_issues_rejects_unsafe_media_runtime(): void
    {
        config()->set('security.runtime.require_https_app_url', false);
        config()->set('security.runtime.require_https_frontend_url', false);
        config()->set('security.runtime.require_session_secure_cookie', false);
        config()->set('security.runtime.require_database_session_driver', false);
        config()->set('security.runtime.require_hsts', false);
        config()->set('security.runtime.require_sanctum_stateful_domains', false);
        config()->set('security.runtime.require_trusted_proxies', false);
        config()->set('security.runtime.require_private_media_disk', true);
        config()->set('security.runtime.require_media_finalize_verification', true);
        config()->set('filesystems.media_disk', 'local');
        config()->set('filesystems.disks.local.driver', 'local');
        config()->set('filesystems.verify_direct_uploads_on_finalize', false);

        $issues = app(ProductionRuntimePolicyValidator::class)->findProductionIssues();

        $this->assertCount(2, $issues);
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'MEDIA_DISK')));
        $this->assertTrue(collect($issues)->contains(fn (string $issue): bool => str_contains($issue, 'MEDIA_VERIFY_DIRECT_UPLOADS_ON_FINALIZE')));
    }
}
