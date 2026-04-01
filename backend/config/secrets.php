<?php

$disallowedValues = (string) env(
    'SECRETS_DISALLOWED_VALUES',
    'null,secret,password,changeme,change-me,example,test,your-secret-here,replace-me'
);

$additionalRequired = (string) env('SECRETS_ADDITIONAL_REQUIRED', '');

return [
    // Enable fail-fast secret checks during production app boot.
    'enforce_runtime' => env('SECRETS_ENFORCE_RUNTIME', true),

    // Values in this list are treated as insecure placeholders for secrets.
    'disallowed_values' => array_values(array_filter(
        array_map(static fn (string $value): string => strtolower(trim($value)), explode(',', $disallowedValues)),
        static fn (string $value): bool => $value !== '',
    )),

    // Known non-production app key placeholders that must never be used.
    'disallowed_app_keys' => [
        '',
        'SomeRandomString',
        'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    ],

    // Optional comma-separated env var names that are required in production.
    // Example: SENTRY_LARAVEL_DSN,THIRD_PARTY_API_KEY
    'additional_required' => array_values(array_filter(
        array_map(static fn (string $value): string => strtoupper(trim($value)), explode(',', $additionalRequired)),
        static fn (string $value): bool => $value !== '',
    )),

    // Require Sentry DSN in production when error tracking is mandatory.
    'require_sentry_dsn' => env('SENTRY_REQUIRED', false),
];
