<?php

return [
    'headers' => [
        'enabled' => env('SECURITY_HEADERS_ENABLED', true),
        'x_frame_options' => env('SECURITY_HEADER_X_FRAME_OPTIONS', 'DENY'),
        'x_content_type_options' => env('SECURITY_HEADER_X_CONTENT_TYPE_OPTIONS', 'nosniff'),
        'referrer_policy' => env('SECURITY_HEADER_REFERRER_POLICY', 'no-referrer'),
        'permissions_policy' => env(
            'SECURITY_HEADER_PERMISSIONS_POLICY',
            'geolocation=(), microphone=(), camera=(), payment=()'
        ),
        'content_security_policy' => env(
            'SECURITY_HEADER_CSP',
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        ),
        'hsts_enabled' => env('SECURITY_HSTS_ENABLED', false),
        'hsts_max_age' => (int) env('SECURITY_HSTS_MAX_AGE', 31536000),
        'hsts_include_subdomains' => env('SECURITY_HSTS_INCLUDE_SUBDOMAINS', true),
        'hsts_preload' => env('SECURITY_HSTS_PRELOAD', false),
    ],

    'runtime' => [
        // Enforce runtime transport/security policy in production boot.
        'enforce_runtime' => env('SECURITY_RUNTIME_ENFORCE', true),

        // Production policy checks.
        'require_https_app_url' => env('SECURITY_REQUIRE_HTTPS_APP_URL', true),
        'require_session_secure_cookie' => env('SECURITY_REQUIRE_SESSION_SECURE_COOKIE', true),
        'require_hsts' => env('SECURITY_REQUIRE_HSTS', true),
        'require_sanctum_stateful_domains' => env('SECURITY_REQUIRE_SANCTUM_STATEFUL_DOMAINS', true),
        'require_trusted_proxies' => env('SECURITY_REQUIRE_TRUSTED_PROXIES', true),
    ],
];
