<?php

namespace App\Support;

use RuntimeException;

class ProductionRuntimePolicyValidator
{
    /**
     * Runtime enforcement is only active in production by default.
     */
    public function shouldEnforceAtRuntime(): bool
    {
        return app()->environment('production') && (bool) config('security.runtime.enforce_runtime', true);
    }

    /**
     * @return array<int, string>
     */
    public function findProductionIssues(): array
    {
        $issues = [];

        if ((bool) config('security.runtime.require_https_app_url', true)) {
            $appUrl = (string) config('app.url', '');
            if (!$this->isHttpsUrl($appUrl)) {
                $issues[] = 'APP_URL must use https:// in production.';
            }
        }

        if ((bool) config('security.runtime.require_session_secure_cookie', true)) {
            if ((bool) config('session.secure') !== true) {
                $issues[] = 'SESSION_SECURE_COOKIE must be true in production.';
            }
        }

        if ((bool) config('security.runtime.require_hsts', true)) {
            if ((bool) config('security.headers.hsts_enabled', false) !== true) {
                $issues[] = 'SECURITY_HSTS_ENABLED must be true in production.';
            }
        }

        if ((bool) config('security.runtime.require_sanctum_stateful_domains', true)) {
            /** @var array<int, mixed> $rawDomains */
            $rawDomains = (array) config('sanctum.stateful', []);
            $domains = array_values(array_filter(
                array_map(static fn (mixed $value): string => is_string($value) ? trim($value) : '', $rawDomains),
                static fn (string $value): bool => $value !== ''
            ));

            if ($domains === []) {
                $issues[] = 'SANCTUM_STATEFUL_DOMAINS must be configured in production.';
            } else {
                $nonLocal = array_values(array_filter($domains, fn (string $domain): bool => !$this->isLocalDomain($domain)));

                if ($nonLocal === []) {
                    $issues[] = 'SANCTUM_STATEFUL_DOMAINS must contain at least one non-localhost domain in production.';
                }
            }
        }

        if ((bool) config('security.runtime.require_trusted_proxies', true)) {
            $trustedProxies = $this->readEnvironmentValue('TRUSTED_PROXIES');
            if ($trustedProxies === null || trim($trustedProxies) === '') {
                $issues[] = 'TRUSTED_PROXIES must be configured in production.';
            }
        }

        return $issues;
    }

    public function assertProductionPolicyOrFail(): void
    {
        $issues = $this->findProductionIssues();

        if ($issues === []) {
            return;
        }

        $message = "Production runtime security policy check failed:\n- ".implode("\n- ", $issues);

        throw new RuntimeException($message);
    }

    private function isHttpsUrl(string $url): bool
    {
        $trimmed = trim($url);
        if ($trimmed === '') {
            return false;
        }

        $scheme = parse_url($trimmed, PHP_URL_SCHEME);

        return is_string($scheme) && strtolower($scheme) === 'https';
    }

    private function isLocalDomain(string $domain): bool
    {
        $normalized = trim(strtolower($domain));
        if ($normalized === '') {
            return true;
        }

        if (str_contains($normalized, '://')) {
            $host = parse_url($normalized, PHP_URL_HOST);
            $normalized = is_string($host) ? $host : $normalized;
        } elseif (str_contains($normalized, ':')) {
            $normalized = explode(':', $normalized)[0];
        }

        return in_array($normalized, ['localhost', '127.0.0.1', '::1'], true);
    }

    private function readEnvironmentValue(string $name): ?string
    {
        $envValue = getenv($name);
        if (is_string($envValue)) {
            return $envValue;
        }

        $serverValue = $_SERVER[$name] ?? null;
        if (is_string($serverValue)) {
            return $serverValue;
        }

        return null;
    }
}
