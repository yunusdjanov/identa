<?php

namespace Tests\Unit;

use App\Models\Patient;
use App\Services\Media\MediaQueueDispatcher;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Support\Facades\Log;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class MediaQueueDispatcherTest extends TestCase
{
    public function test_temporary_broker_failure_is_reported_without_escaping_the_upload_flow(): void
    {
        Log::spy();
        $bus = Mockery::mock(Dispatcher::class);
        $bus->shouldReceive('dispatch')
            ->once()
            ->andThrow(new RuntimeException('broker unavailable'));

        $queued = (new MediaQueueDispatcher($bus))->dispatch(Patient::class, 'patient-1', 7);

        $this->assertFalse($queued);
        Log::shouldHaveReceived('warning')->once();
    }
}
