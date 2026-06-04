<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
    ],

    'payx' => [
        // PayX API integration.
        // Docs: https://payx.uz/docs (POST /api/v1/invoice + webhook).
        // The API token is the merchant's Bearer token (pk_test_... or
        // pk_live_...). The project token is the static Bearer token PayX
        // attaches to every webhook so the receiver can verify the origin.
        'base_url' => env('PAYX_BASE_URL', 'https://backend.payx.uz'),
        'api_token' => env('PAYX_API_TOKEN'),
        'project_token' => env('PAYX_PROJECT_TOKEN'),
    ],

];
