<?php

namespace Tests\Unit;

use App\Services\Media\AntivirusScanner;
use App\Services\Media\NullAntivirusScanner;
use Tests\TestCase;

class AntivirusScannerTest extends TestCase
{
    public function test_null_antivirus_scanner_is_bound_for_local_driver(): void
    {
        config()->set('media-security.antivirus.driver', 'null');

        $scanner = $this->app->make(AntivirusScanner::class);

        $this->assertInstanceOf(NullAntivirusScanner::class, $scanner);
        $result = $scanner->scanString('safe image bytes');

        $this->assertTrue($result->isClean());
        $this->assertSame('null', $result->provider);
    }
}
