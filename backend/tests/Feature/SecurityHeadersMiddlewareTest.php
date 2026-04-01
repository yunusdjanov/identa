<?php

namespace Tests\Feature;

use Tests\TestCase;

class SecurityHeadersMiddlewareTest extends TestCase
{
    public function test_security_headers_are_added_to_api_responses(): void
    {
        $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()')
            ->assertHeader(
                'Content-Security-Policy',
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
            )
            ->assertHeaderMissing('Strict-Transport-Security');
    }

    public function test_hsts_header_is_added_only_for_secure_requests_when_enabled(): void
    {
        config()->set('security.headers.hsts_enabled', true);

        $this->withHeaders([
            'X-Forwarded-Proto' => 'https',
        ])->getJson('/api/v1/health')
            ->assertOk()
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    public function test_hsts_header_is_not_added_for_insecure_requests(): void
    {
        config()->set('security.headers.hsts_enabled', true);

        $this->withServerVariables([
            'HTTPS' => 'off',
        ])->getJson('/api/v1/health')
            ->assertOk()
            ->assertHeaderMissing('Strict-Transport-Security');
    }
}
