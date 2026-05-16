<?php

namespace App\Services\Media;

class ClamAvAntivirusScanner implements AntivirusScanner
{
    public function __construct(
        private readonly string $host,
        private readonly int $port,
        private readonly float $timeout,
    ) {
    }

    public function scanString(string $contents): ScanResult
    {
        $socket = @fsockopen($this->host, $this->port, $errno, $errstr, $this->timeout);
        if (! is_resource($socket)) {
            return ScanResult::failed('clamav', trim($errstr) !== '' ? $errstr : "ClamAV connection failed ({$errno})");
        }

        try {
            stream_set_timeout($socket, (int) ceil($this->timeout));
            fwrite($socket, "zINSTREAM\0");

            foreach (str_split($contents, 8192) as $chunk) {
                fwrite($socket, pack('N', strlen($chunk)).$chunk);
            }

            fwrite($socket, pack('N', 0));
            $response = stream_get_contents($socket);
        } finally {
            fclose($socket);
        }

        return $this->parseResponse((string) $response);
    }

    public function scanPath(string $path): ScanResult
    {
        $contents = @file_get_contents($path);
        if (! is_string($contents)) {
            return ScanResult::failed('clamav', 'Unable to read file for scanning.');
        }

        return $this->scanString($contents);
    }

    private function parseResponse(string $response): ScanResult
    {
        $normalized = trim($response);
        if ($normalized === '') {
            return ScanResult::failed('clamav', 'Empty ClamAV response.');
        }

        if (str_ends_with($normalized, 'OK')) {
            return ScanResult::clean('clamav', $normalized);
        }

        if (str_contains($normalized, 'FOUND')) {
            return ScanResult::infected('clamav', $normalized);
        }

        return ScanResult::failed('clamav', $normalized);
    }
}
