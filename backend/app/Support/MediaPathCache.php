<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

class MediaPathCache
{
    public static function get(string $disk, string $path): ?bool
    {
        $value = Cache::get(self::key($disk, $path));

        return is_bool($value) ? $value : null;
    }

    public static function markPresent(string $disk, string $path): void
    {
        Cache::put(self::key($disk, $path), true, now()->addDays(7));
    }

    public static function markMissing(string $disk, string $path): void
    {
        Cache::put(self::key($disk, $path), false, now()->addMinutes(2));
    }

    /**
     * @param list<string> $paths
     */
    public static function forgetPaths(string $disk, array $paths): void
    {
        foreach ($paths as $path) {
            $normalizedPath = trim($path);

            if ($normalizedPath === '') {
                continue;
            }

            Cache::forget(self::key($disk, $normalizedPath));
        }
    }

    private static function key(string $disk, string $path): string
    {
        return 'media-path-exists:'.sha1(trim($disk).'|'.trim($path));
    }
}
