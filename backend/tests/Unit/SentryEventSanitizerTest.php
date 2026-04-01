<?php

namespace Tests\Unit;

use App\Support\SentryEventSanitizer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Sentry\Event;
use Tests\TestCase;

class SentryEventSanitizerTest extends TestCase
{
    public function test_before_send_adds_request_and_user_context_and_scrubs_sensitive_fields(): void
    {
        $request = Request::create('/api/v1/test', 'POST');
        $request->attributes->set('request_id', 'req-abc-123');
        $user = new class
        {
            public string $role = 'dentist';

            public function getAuthIdentifier(): string
            {
                return 'user-42';
            }
        };
        $request->setUserResolver(fn ($guard = null) => $user);
        Auth::resolveUsersUsing(fn ($guard = null) => $user);

        app()->instance('request', $request);

        $event = Event::createEvent();
        $event->setRequest([
            'headers' => [
                'Authorization' => ['Bearer secret-token'],
                'X-Custom' => ['safe-value'],
            ],
            'data' => [
                'password' => 'plain',
                'nested' => [
                    'access_token' => 'top-secret',
                ],
            ],
        ]);
        $event->setExtra([
            'api_key' => 'abc123',
            'note' => 'ok',
        ]);
        $event->setContext('debug', [
            'refresh_token' => 'refresh-secret',
            'safe' => 'value',
        ]);

        $result = SentryEventSanitizer::beforeSend($event);

        $this->assertSame('req-abc-123', $result?->getTags()['request_id'] ?? null);
        $this->assertSame('user-42', $result?->getUser()?->getId());
        $this->assertSame('[Filtered]', $result?->getRequest()['headers']['Authorization']);
        $this->assertSame('[Filtered]', $result?->getRequest()['data']['password']);
        $this->assertSame('[Filtered]', $result?->getRequest()['data']['nested']['access_token']);
        $this->assertSame('ok', $result?->getExtra()['note']);
        $this->assertSame('[Filtered]', $result?->getExtra()['api_key']);
        $this->assertSame('[Filtered]', $result?->getContexts()['debug']['refresh_token']);
    }

    public function test_sanitize_array_handles_nested_structures(): void
    {
        $payload = [
            'token' => 'value',
            'meta' => [
                'client_secret' => 'value',
                'safe' => 'value',
            ],
        ];

        $sanitized = SentryEventSanitizer::sanitizeArray($payload);

        $this->assertSame('[Filtered]', $sanitized['token']);
        $this->assertSame('[Filtered]', $sanitized['meta']['client_secret']);
        $this->assertSame('value', $sanitized['meta']['safe']);
    }
}
