<?php

namespace App\Services\Media;

interface AntivirusScanner
{
    public function scanString(string $contents): ScanResult;

    public function scanPath(string $path): ScanResult;
}
