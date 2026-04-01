<?php

use App\Support\SentryEventSanitizer;

return [
    // Provider DSN. Keep empty in local/dev if you do not want to send events.
    'dsn' => env('SENTRY_LARAVEL_DSN', env('SENTRY_DSN')),

    // Release metadata can be set from CI/CD.
    'release' => env('SENTRY_RELEASE'),

    // Use APP_ENV by default when not explicitly set.
    'environment' => env('SENTRY_ENVIRONMENT'),

    // Keep PII collection disabled by default.
    'send_default_pii' => env('SENTRY_SEND_DEFAULT_PII', false),

    // Conservative defaults for cost and noise control.
    'sample_rate' => env('SENTRY_SAMPLE_RATE') === null ? 1.0 : (float) env('SENTRY_SAMPLE_RATE'),
    'traces_sample_rate' => env('SENTRY_TRACES_SAMPLE_RATE') === null ? null : (float) env('SENTRY_TRACES_SAMPLE_RATE'),
    'profiles_sample_rate' => env('SENTRY_PROFILES_SAMPLE_RATE') === null ? null : (float) env('SENTRY_PROFILES_SAMPLE_RATE'),

    // Ignore framework health route from tracing noise.
    'ignore_transactions' => [
        '/up',
        '/api/v1/health',
    ],

    // Attach request/user context and scrub sensitive payload values.
    'before_send' => [SentryEventSanitizer::class, 'beforeSend'],
];
