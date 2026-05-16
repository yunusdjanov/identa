<?php

namespace App\Services\Media;

class NullAntivirusScanner implements AntivirusScanner
{
    public function scanString(string $contents): ScanResult
    {
        return ScanResult::clean('null');
    }

    public function scanPath(string $path): ScanResult
    {
        return ScanResult::clean('null');
    }
}
