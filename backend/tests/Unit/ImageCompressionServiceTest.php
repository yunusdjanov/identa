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

    public function test_optimize_contents_rejects_decompression_bomb_dimensions(): void
    {
        // A minimal PNG header that declares a ~900-megapixel canvas
        // (30000x30000) in a handful of bytes. Decoding it would allocate
        // gigabytes of raw bitmap, so the megapixel guard must reject it
        // before imagecreatefromstring() is ever called.
        $width = 30000;
        $height = 30000;
        $ihdr = pack('N', $width).pack('N', $height)."\x08\x02\x00\x00\x00";
        $ihdrChunk = pack('N', strlen($ihdr)).'IHDR'.$ihdr.pack('N', crc32('IHDR'.$ihdr));
        $bombHeader = "\x89PNG\r\n\x1a\n".$ihdrChunk;

        // Sanity-check the crafted header actually reports the bomb dimensions.
        $reported = getimagesizefromstring($bombHeader);
        $this->assertIsArray($reported);
        $this->assertSame($width, $reported[0]);
        $this->assertSame($height, $reported[1]);

        $result = app(ImageCompressionService::class)->optimizeContents($bombHeader, 'image/png', null);

        $this->assertNull($result);
    }

    public function test_optimize_contents_accepts_a_normal_sized_image(): void
    {
        $image = imagecreatetruecolor(64, 48);
        ob_start();
        imagejpeg($image);
        $jpeg = (string) ob_get_clean();
        imagedestroy($image);

        $result = app(ImageCompressionService::class)->optimizeContents($jpeg, 'image/jpeg', null);

        $this->assertIsArray($result);
        $this->assertGreaterThan(0, $result['file_size']);
    }

    public function test_optimize_contents_reencodes_and_strips_trailing_metadata_bytes(): void
    {
        $image = imagecreatetruecolor(64, 48);
        ob_start();
        imagejpeg($image, null, 85);
        $jpeg = (string) ob_get_clean();
        imagedestroy($image);
        $sentinel = 'IDENTA-PRIVATE-METADATA-SENTINEL';

        $result = app(ImageCompressionService::class)->optimizeContents($jpeg.$sentinel, 'image/jpeg', null);

        $this->assertIsArray($result);
        $this->assertStringNotContainsString($sentinel, $result['contents']);
        $this->assertNotSame($jpeg.$sentinel, $result['contents']);
    }

    public function test_optimize_contents_preserves_transparency_without_jpeg_conversion(): void
    {
        $image = imagecreatetruecolor(8, 8);
        imagealphablending($image, false);
        imagesavealpha($image, true);
        $transparent = imagecolorallocatealpha($image, 255, 255, 255, 127);
        imagefill($image, 0, 0, $transparent);
        ob_start();
        imagepng($image);
        $png = (string) ob_get_clean();
        imagedestroy($image);

        $result = app(ImageCompressionService::class)->optimizeContents($png, 'image/png', null);
        $decoded = imagecreatefromstring((string) ($result['contents'] ?? ''));

        $this->assertIsArray($result);
        $this->assertNotSame('image/jpeg', $result['mime_type']);
        $this->assertNotFalse($decoded);
        $this->assertGreaterThan(0, (imagecolorat($decoded, 0, 0) >> 24) & 0x7f);
        imagedestroy($decoded);
    }

    public function test_optimize_contents_applies_jpeg_exif_orientation_before_stripping_it(): void
    {
        $image = imagecreatetruecolor(64, 48);
        ob_start();
        imagejpeg($image, null, 85);
        $jpeg = (string) ob_get_clean();
        imagedestroy($image);

        $tiff = 'II'.pack('v', 42).pack('V', 8)
            .pack('v', 1)
            .pack('v', 0x0112).pack('v', 3).pack('V', 1).pack('v', 6).pack('v', 0)
            .pack('V', 0);
        $exif = "Exif\x00\x00".$tiff;
        $orientedJpeg = substr($jpeg, 0, 2)."\xFF\xE1".pack('n', strlen($exif) + 2).$exif.substr($jpeg, 2);

        $result = app(ImageCompressionService::class)->optimizeContents($orientedJpeg, 'image/jpeg', null);
        $dimensions = getimagesizefromstring((string) ($result['contents'] ?? ''));

        $this->assertIsArray($result);
        $this->assertIsArray($dimensions);
        $this->assertSame(48, $dimensions[0]);
        $this->assertSame(64, $dimensions[1]);
    }
}
