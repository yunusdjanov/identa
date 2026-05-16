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
];
