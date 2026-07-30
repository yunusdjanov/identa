<?php

return [
    'antivirus' => [
        'driver' => env('ANTIVIRUS_DRIVER', env('APP_ENV') === 'production' ? 'clamav' : 'null'),
        'clamav' => [
            'host' => env('CLAMAV_HOST', '127.0.0.1'),
            'port' => (int) env('CLAMAV_PORT', 3310),
            'timeout' => (float) env('CLAMAV_TIMEOUT', 10),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Absolute upload ceiling
    |--------------------------------------------------------------------------
    |
    | Subscription plans may set a lower per-file limit. This platform ceiling
    | protects PHP workers, scanners, and image decoders from oversized input
    | across multipart and direct-upload paths.
    |
    */
    'max_upload_mb' => (float) env('MEDIA_MAX_UPLOAD_MB', 20),
];
