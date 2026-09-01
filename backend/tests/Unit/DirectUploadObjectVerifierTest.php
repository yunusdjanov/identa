<?php

namespace Tests\Unit;

use App\Services\Media\DirectUploadObjectVerifier;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DirectUploadObjectVerifierTest extends TestCase
{
    public function test_it_reads_actual_size_and_supported_type_from_stored_bytes(): void
    {
        Storage::fake('local');
        $objects = [
            'quarantine/photo.jpg' => ["\xFF\xD8\xFF".str_repeat('a', 20), 'image/jpeg'],
            'quarantine/photo.png' => ["\x89PNG\r\n\x1A\n".str_repeat('b', 20), 'image/png'],
            'quarantine/photo.webp' => ['RIFF'.pack('V', 16).'WEBP'.str_repeat('c', 16), 'image/webp'],
        ];

        $verifier = app(DirectUploadObjectVerifier::class);
        foreach ($objects as $path => [$contents, $mimeType]) {
            Storage::disk('local')->put($path, $contents);

            $this->assertSame([
                'file_size' => strlen($contents),
                'mime_type' => $mimeType,
            ], $verifier->inspect('local', $path));
        }
    }

    public function test_it_fails_closed_for_missing_empty_or_unsupported_objects(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('quarantine/empty.jpg', '');
        Storage::disk('local')->put('quarantine/not-image.jpg', 'plain text');
        $verifier = app(DirectUploadObjectVerifier::class);

        $this->assertNull($verifier->inspect('local', 'quarantine/missing.jpg'));
        $this->assertNull($verifier->inspect('local', 'quarantine/empty.jpg'));
        $this->assertNull($verifier->inspect('local', 'quarantine/not-image.jpg'));
    }
}
