<?php

namespace App\Support;

use Sentry\Event;
use Sentry\EventHint;
use Sentry\UserDataBag;

class SentryEventSanitizer
{
    private const REDACTED_VALUE = '[Filtered]';

    private const SENSITIVE_KEYS = [
        'password',
        'password_confirmation',
        'pass',
        'passwd',
        'pwd',
        'token',
        'access_token',
        'refresh_token',
        'id_token',
        'authorization',
        'cookie',
        'set-cookie',
        'x-api-key',
        'api_key',
        'apikey',
        'secret',
        'client_secret',
        'x-csrf-token',
        'x-xsrf-token',
        'csrf_token',
        '_token',
    ];

    public static function beforeSend(Event $event, ?EventHint $hint = null): ?Event
    {
        unset($hint);

        $request = request();

        $requestId = $request->attributes->get('request_id') ?? $request->header('X-Request-Id');
        if (is_string($requestId) && trim($requestId) !== '') {
            $event->setTag('request_id', trim($requestId));
        }

        $authenticatedUser = $request->user();
        if ($authenticatedUser === null && function_exists('auth')) {
            $authenticatedUser = auth()->user();
        }

        if ($authenticatedUser !== null && method_exists($authenticatedUser, 'getAuthIdentifier')) {
            $userData = ['id' => (string) $authenticatedUser->getAuthIdentifier()];

            if (isset($authenticatedUser->role) && is_string($authenticatedUser->role)) {
                $userData['role'] = $authenticatedUser->role;
            }

            $event->setUser(UserDataBag::createFromArray($userData));
        }

        $requestPayload = $event->getRequest();
        if ($requestPayload !== []) {
            $event->setRequest(self::sanitizeArray($requestPayload));
        }

        $event->setExtra(self::sanitizeArray($event->getExtra()));

        foreach ($event->getContexts() as $contextName => $contextData) {
            if (is_array($contextData)) {
                $event->setContext($contextName, self::sanitizeArray($contextData));
            }
        }

        return $event;
    }

    /**
     * @param  array<mixed>  $payload
     * @return array<mixed>
     */
    public static function sanitizeArray(array $payload): array
    {
        $sanitized = [];

        foreach ($payload as $key => $value) {
            $normalizedKey = is_string($key) ? strtolower(trim($key)) : null;

            if ($normalizedKey !== null && self::isSensitiveKey($normalizedKey)) {
                $sanitized[$key] = self::REDACTED_VALUE;
                continue;
            }

            if (is_array($value)) {
                $sanitized[$key] = self::sanitizeArray($value);
                continue;
            }

            $sanitized[$key] = $value;
        }

        return $sanitized;
    }

    private static function isSensitiveKey(string $key): bool
    {
        foreach (self::SENSITIVE_KEYS as $sensitiveKey) {
            if ($key === $sensitiveKey) {
                return true;
            }

            if (str_ends_with($key, ".{$sensitiveKey}") || str_ends_with($key, "_{$sensitiveKey}")) {
                return true;
            }
        }

        return false;
    }
}
