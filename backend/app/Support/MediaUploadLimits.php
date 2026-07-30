<?php

namespace App\Support;

final class MediaUploadLimits
{
    public static function maxBytes(): int
    {
        return max(1, (int) round(self::maxMegabytes() * 1024 * 1024));
    }

    public static function maxKilobytes(): int
    {
        return max(1, (int) ceil(self::maxBytes() / 1024));
    }

    public static function maxMegabytes(): float
    {
        return max(0.01, (float) config('media-security.max_upload_mb', 20));
    }
}
