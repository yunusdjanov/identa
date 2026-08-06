<?php

return [
    'antivirus' => [
        // Production currently uses the authenticated, image-only validation
        // pipeline without ClamAV. Keep the default aligned with that policy so
        // a missing env value cannot make uploads call an absent localhost daemon.
        'driver' => env('ANTIVIRUS_DRIVER', 'null'),
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

    /*
    |--------------------------------------------------------------------------
    | Pending upload recovery
    |--------------------------------------------------------------------------
    |
    | A stored quarantine object must not become permanently invisible merely
    | because the queue broker was unavailable during the finalize request.
    | Queue workers periodically re-enqueue old pending rows in bounded batches.
    |
    */
    'recovery' => [
        'enabled' => (bool) env('MEDIA_PENDING_RECOVERY_ENABLED', true),
        'min_age_seconds' => max(60, (int) env('MEDIA_PENDING_RECOVERY_MIN_AGE_SECONDS', 300)),
        'interval_seconds' => max(15, (int) env('MEDIA_PENDING_RECOVERY_INTERVAL_SECONDS', 60)),
        'batch_size_per_model' => max(1, min(1000, (int) env('MEDIA_PENDING_RECOVERY_BATCH_SIZE', 100))),
    ],
];
