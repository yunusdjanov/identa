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

        if ((bool) config('security.runtime.require_https_frontend_url', true)) {
            $frontendUrls = array_values(array_filter(array_map(
                static fn (string $url): string => trim($url),
                explode(',', (string) config('app.frontend_url', '')),
            )));
            $normalizedFrontendOrigins = array_values(array_filter(array_map(
                fn (string $url): ?string => $this->normalizeHttpsOrigin($url),
                $frontendUrls,
            )));
            if ($frontendUrls === [] || count($normalizedFrontendOrigins) !== count($frontendUrls)) {
                $issues[] = 'FRONTEND_URL must contain only valid https:// origins in production.';
            }

            /** @var list<string> $corsOrigins */
            $corsOrigins = array_values(array_filter(array_map(
                static fn (mixed $origin): string => is_string($origin) ? trim($origin) : '',
                (array) config('cors.allowed_origins', []),
            )));
            $normalizedCorsOrigins = array_values(array_filter(array_map(
                fn (string $origin): ?string => $this->normalizeHttpsOrigin($origin),
                $corsOrigins,
            )));

            if ($corsOrigins === [] || count($normalizedCorsOrigins) !== count($corsOrigins)) {
                $issues[] = 'CORS frontend origins must contain only valid https:// origins in production.';
            }

            if (array_diff($normalizedFrontendOrigins, $normalizedCorsOrigins) !== []) {
                $issues[] = 'Every FRONTEND_URL origin must be present in the CORS allow-list.';
            }

            $frontendDomains = array_values(array_filter(array_map(
                fn (string $origin): ?string => $this->domainWithOptionalPort($origin),
                $normalizedFrontendOrigins,
            )));
            $statefulDomains = array_values(array_filter(array_map(
                fn (mixed $domain): string => is_string($domain) ? $this->normalizeDomain($domain) : '',
                (array) config('sanctum.stateful', []),
            )));
            if (array_diff($frontendDomains, $statefulDomains) !== []) {
                $issues[] = 'SANCTUM_STATEFUL_DOMAINS must include every FRONTEND_URL host.';
            }
        }

        if ((bool) config('security.runtime.require_session_secure_cookie', true)) {
            if ((bool) config('session.secure') !== true) {
                $issues[] = 'SESSION_SECURE_COOKIE must be true in production.';
            }
        }

        if ((bool) config('security.runtime.require_database_session_driver', true)) {
            if ((string) config('session.driver') !== 'database') {
                $issues[] = 'SESSION_DRIVER must be database in production so password resets can revoke browser sessions.';
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

        if ((bool) config('security.runtime.require_private_media_disk', true)) {
            $mediaDisk = trim((string) config('filesystems.media_disk', ''));
            $mediaDriver = $mediaDisk !== ''
                ? trim((string) config("filesystems.disks.{$mediaDisk}.driver", ''))
                : '';
            if ($mediaDisk === '' || $mediaDriver !== 's3') {
                $issues[] = 'MEDIA_DISK must reference a private S3-compatible disk in production.';
            }
        }

        if (
            (bool) config('security.runtime.require_media_finalize_verification', true)
            && (bool) config('filesystems.verify_direct_uploads_on_finalize', true) !== true
        ) {
            $issues[] = 'MEDIA_VERIFY_DIRECT_UPLOADS_ON_FINALIZE must be true in production.';
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
        return $this->normalizeHttpsOrigin($url) !== null;
    }

    private function normalizeHttpsOrigin(string $url): ?string
    {
        $trimmed = rtrim(trim($url), '/');
        if ($trimmed === '' || filter_var($trimmed, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        $scheme = parse_url($trimmed, PHP_URL_SCHEME);
        $host = parse_url($trimmed, PHP_URL_HOST);
        $path = parse_url($trimmed, PHP_URL_PATH);
        if (
            ! is_string($scheme)
            || strtolower($scheme) !== 'https'
            || ! is_string($host)
            || $host === ''
            || (is_string($path) && ! in_array($path, ['', '/'], true))
            || parse_url($trimmed, PHP_URL_USER) !== null
            || parse_url($trimmed, PHP_URL_PASS) !== null
            || parse_url($trimmed, PHP_URL_QUERY) !== null
            || parse_url($trimmed, PHP_URL_FRAGMENT) !== null
        ) {
            return null;
        }

        $port = parse_url($trimmed, PHP_URL_PORT);

        return 'https://'.strtolower($host).($port !== null ? ':'.$port : '');
    }

    private function domainWithOptionalPort(string $url): ?string
    {
        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            return null;
        }

        $port = parse_url($url, PHP_URL_PORT);

        return strtolower($host).($port !== null ? ':'.$port : '');
    }

    private function normalizeDomain(string $domain): string
    {
        $normalized = trim(strtolower($domain));
        if (str_contains($normalized, '://')) {
            return $this->domainWithOptionalPort($normalized) ?? $normalized;
        }

        return rtrim($normalized, '/');
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
