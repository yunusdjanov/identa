<?php

$configuredOrigins = (string) env(
    'FRONTEND_URLS',
    env('FRONTEND_URL', 'http://localhost:3000,http://127.0.0.1:3000,https://identa-dp8w4tfnr-yunusdjanovs-projects.vercel.app')
);

$allowedOrigins = array_values(array_filter(
    array_map(static fn (string $origin): string => trim($origin), explode(',', $configuredOrigins)),
    static fn (string $origin): bool => $origin !== '',
));

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,
];
