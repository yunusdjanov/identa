<?php

namespace App\Services\Media;

use Illuminate\Support\Facades\Storage;

class DirectUploadObjectVerifier
{
    private const HEADER_BYTES = 12;

    /**
     * Read metadata from the stored object rather than trusting the browser's
     * direct-upload ticket. Only a bounded header is streamed; the queued
     * sanitizer remains responsible for fully decoding and re-encoding it.
     *
     * @return array{file_size: int, mime_type: string}|null
     */
    public function inspect(string $disk, string $path): ?array
    {
        $disk = trim($disk);
        $path = trim($path);
        if ($disk === '' || $path === '') {
            return null;
        }

        $stream = null;

        try {
            $storage = Storage::disk($disk);
            $fileSize = (int) $storage->size($path);
            if ($fileSize <= 0) {
                return null;
            }

            $stream = $storage->readStream($path);
            if (! is_resource($stream)) {
                return null;
            }

            $header = $this->readHeader($stream);

            $mimeType = $this->mimeTypeFromHeader($header);
            if ($mimeType === null) {
                return null;
            }

            return [
                'file_size' => $fileSize,
                'mime_type' => $mimeType,
            ];
        } catch (\Throwable) {
            return null;
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }
    }

    /**
     * @param resource $stream
     */
    private function readHeader(mixed $stream): string
    {
        $header = '';

        while (strlen($header) < self::HEADER_BYTES && ! feof($stream)) {
            $chunk = fread($stream, self::HEADER_BYTES - strlen($header));
            if (! is_string($chunk) || $chunk === '') {
                break;
            }

            $header .= $chunk;
        }

        return $header;
    }

    private function mimeTypeFromHeader(string $header): ?string
    {
        if (strlen($header) >= 3 && substr($header, 0, 3) === "\xFF\xD8\xFF") {
            return 'image/jpeg';
        }

        if (strlen($header) >= 8 && substr($header, 0, 8) === "\x89PNG\r\n\x1A\n") {
            return 'image/png';
        }

        if (
            strlen($header) >= 12
            && substr($header, 0, 4) === 'RIFF'
            && substr($header, 8, 4) === 'WEBP'
        ) {
            return 'image/webp';
        }

        return null;
    }
}
