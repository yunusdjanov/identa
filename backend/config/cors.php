<?php

$configuredOrigins = (string) env(
    'FRONTEND_URLS',
    env('FRONTEND_URL', 'http://localhost:3000,http://127.0.0.1:3000')
);

$allowedOrigins = array_values(array_filter(
    array_map(static function (string $origin): string {
        $normalized = trim($origin);
        $normalized = trim($normalized, " \t\n\r\0\x0B\"'");

        return rtrim($normalized, '/');
    }, explode(',', $configuredOrigins)),
    static fn (string $origin): bool => $origin !== '',
));

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie', 'login', 'logout'],

    'allowed_methods' => ['*'],

    'allowed_origins' => ['https://identa-cyan.vercel.app'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,
];
