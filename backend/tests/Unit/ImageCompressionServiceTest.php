<?php

namespace Tests\Unit;

use App\Services\ImageCompressionService;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

class ImageCompressionServiceTest extends TestCase
{
    public function test_stored_object_optimization_fails_closed_for_non_image_bytes(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('quarantine/not-image.jpg', 'not actually an image');

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Unable to sanitize image.');

        app(ImageCompressionService::class)->optimizeStoredObject('local', 'quarantine/not-image.jpg', null);
    }
}
