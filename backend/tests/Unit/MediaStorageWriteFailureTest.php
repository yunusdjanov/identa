<?php

namespace Tests\Unit;

use App\Jobs\GenerateMediaVariantBatch;
use App\Jobs\GenerateMediaVariants;
use Illuminate\Support\Facades\Storage;
use Mockery;
use RuntimeException;
use Tests\TestCase;

class MediaStorageWriteFailureTest extends TestCase
{
    public function test_variant_job_throws_when_storage_returns_false(): void
    {
        $disk = $this->failingWriteDisk();
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        $job = new GenerateMediaVariants('local', 'approved/source.jpg', [
            'thumbnail' => ['path' => 'approved/variants/source-thumbnail.jpg', 'max_edge' => 160],
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Unable to persist generated media variant.');
        $job->handle();
    }

    public function test_variant_batch_throws_when_storage_returns_false(): void
    {
        $disk = $this->failingWriteDisk();
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);

        $job = new GenerateMediaVariantBatch([[
            'disk' => 'local',
            'source_path' => 'approved/source.jpg',
            'variants' => [
                'thumbnail' => ['path' => 'approved/variants/source-thumbnail.jpg', 'max_edge' => 160],
            ],
        ]]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Unable to persist generated media variant.');
        $job->handle();
    }

    private function failingWriteDisk(): object
    {
        $disk = Mockery::mock();
        $disk->shouldReceive('get')->once()->with('approved/source.jpg')->andReturn($this->jpeg());
        $disk->shouldReceive('put')->once()->andReturnFalse();

        return $disk;
    }

    private function jpeg(): string
    {
        $image = imagecreatetruecolor(320, 240);
        ob_start();
        imagejpeg($image);
        $contents = (string) ob_get_clean();
        imagedestroy($image);

        return $contents;
    }
}
