<?php

namespace Tests\Unit;

use App\Jobs\DeleteStoredMediaPaths;
use App\Jobs\GenerateMediaVariantBatch;
use App\Jobs\GenerateMediaVariants;
use App\Jobs\ProcessUploadedMedia;
use App\Models\Patient;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Tests\TestCase;

class MediaQueueConfigurationTest extends TestCase
{
    public function test_media_jobs_use_dedicated_queues(): void
    {
        $variants = new GenerateMediaVariants('s3', 'approved/source.jpg', [
            'thumbnail' => ['path' => 'approved/thumbnail.jpg', 'max_edge' => 160],
        ]);
        $batch = new GenerateMediaVariantBatch([]);
        $process = new ProcessUploadedMedia(Patient::class, 'patient-1', 1);
        $cleanup = new DeleteStoredMediaPaths('s3', ['approved/source.jpg']);

        $this->assertSame('media', $variants->queue);
        $this->assertSame('media', $batch->queue);
        $this->assertSame('media', $process->queue);
        $this->assertSame('cleanup', $cleanup->queue);
    }

    public function test_queue_retry_window_exceeds_every_media_job_timeout(): void
    {
        $longestTimeout = max(
            (new GenerateMediaVariants('s3', 'approved/source.jpg', []))->timeout,
            (new GenerateMediaVariantBatch([]))->timeout,
            (new ProcessUploadedMedia(Patient::class, 'patient-1', 1))->timeout,
            (new DeleteStoredMediaPaths('s3', []))->timeout,
        );

        $this->assertGreaterThan(
            $longestTimeout,
            (int) config('queue.connections.redis.retry_after')
        );
        $this->assertGreaterThan(
            $longestTimeout,
            (int) config('queue.connections.database.retry_after')
        );
    }

    public function test_media_processing_serializes_duplicate_recovery_jobs(): void
    {
        $middleware = (new ProcessUploadedMedia(Patient::class, 'patient-1', 1))->middleware();

        $this->assertCount(1, $middleware);
        $this->assertInstanceOf(WithoutOverlapping::class, $middleware[0]);
    }
}
