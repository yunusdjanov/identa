<?php

namespace Tests\Feature;

use Tests\TestCase;

class RequestContextMiddlewareTest extends TestCase
{
    public function test_request_id_header_is_added_to_api_response(): void
    {
        $response = $this->getJson('/api/v1/health')
            ->assertOk()
            ->assertHeader('X-Request-Id');

        $requestId = $response->headers->get('X-Request-Id');
        $this->assertIsString($requestId);
        $this->assertNotSame('', $requestId);
    }

    public function test_incoming_request_id_is_propagated_to_response(): void
    {
        $incomingRequestId = 'manual-request-id-123';

        $this->withHeaders([
            'X-Request-Id' => $incomingRequestId,
        ])->getJson('/api/v1/health')
            ->assertOk()
            ->assertHeader('X-Request-Id', $incomingRequestId);
    }
}
