<?php

namespace App\Support;

use RuntimeException;

class ProductionSecretsValidator
{
    /**
     * Runtime enforcement is only active in production by default.
     */
    public function shouldEnforceAtRuntime(): bool
    {
        return app()->environment('production') && (bool) config('secrets.enforce_runtime', true);
    }

    /**
     * @return array<int, string>
     */
    public function findProductionIssues(): array
    {
        $issues = [];

        $appKey = (string) config('app.key', '');
        if (!$this->isValidAppKey($appKey)) {
            $issues[] = 'APP_KEY is missing or uses an insecure placeholder value.';
        }

        $defaultConnection = (string) config('database.default', '');
        $connectionConfig = config("database.connections.{$defaultConnection}", []);
        $driver = strtolower((string) ($connectionConfig['driver'] ?? ''));
        $dbPassword = isset($connectionConfig['password']) ? (string) $connectionConfig['password'] : '';

        if ($driver !== 'sqlite' && $this->isWeakSecretValue($dbPassword)) {
            $issues[] = 'DB_PASSWORD is missing or uses an insecure placeholder value.';
        }

        /** @var array<int, string> $additionalRequired */
        $additionalRequired = config('secrets.additional_required', []);
        foreach ($additionalRequired as $envName) {
            $value = $this->readEnvironmentValue($envName);

            if ($this->isWeakSecretValue($value)) {
                $issues[] = sprintf('%s is missing or uses an insecure placeholder value.', $envName);
            }
        }

        $sentryRequired = (bool) config('secrets.require_sentry_dsn', false);
        $sentryDsn = (string) config('sentry.dsn', '');
        if ($sentryRequired && $this->isWeakSecretValue($sentryDsn)) {
            $issues[] = 'SENTRY_LARAVEL_DSN is required in production when SENTRY_REQUIRED=true.';
        }

        return $issues;
    }

    public function assertProductionSecretsOrFail(): void
    {
        $issues = $this->findProductionIssues();

        if ($issues === []) {
            return;
        }

        $message = "Production secrets validation failed:\n- ".implode("\n- ", $issues);

        throw new RuntimeException($message);
    }

    private function isValidAppKey(string $appKey): bool
    {
        if ($this->isWeakSecretValue($appKey)) {
            return false;
        }

        $trimmed = trim($appKey);
        $disallowedAppKeys = array_map(
            static fn (string $value): string => trim($value),
            (array) config('secrets.disallowed_app_keys', [])
        );

        if (in_array($trimmed, $disallowedAppKeys, true)) {
            return false;
        }

        if (str_starts_with($trimmed, 'base64:')) {
            $decoded = base64_decode(substr($trimmed, 7), true);

            return is_string($decoded) && strlen($decoded) >= 32;
        }

        return strlen($trimmed) >= 32;
    }

    private function isWeakSecretValue(?string $value): bool
    {
        if ($value === null) {
            return true;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return true;
        }

        if (str_starts_with($trimmed, '${') && str_ends_with($trimmed, '}')) {
            return true;
        }

        $normalized = strtolower($trimmed);
        $disallowedValues = (array) config('secrets.disallowed_values', []);

        return in_array($normalized, $disallowedValues, true);
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
