<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

final class AnalyticsCacheVersion
{
    public static function tenant(int $dentistId): string
    {
        return (string) Cache::get(self::tenantKey($dentistId), 'initial');
    }

    public static function bumpTenant(int $dentistId): void
    {
        if ($dentistId <= 0) {
            return;
        }

        Cache::forever(self::tenantKey($dentistId), Str::uuid()->toString());
    }

    public static function admin(): string
    {
        return (string) Cache::get(self::adminKey(), 'initial');
    }

    public static function bumpAdmin(): void
    {
        Cache::forever(self::adminKey(), Str::uuid()->toString());
    }

    private static function tenantKey(int $dentistId): string
    {
        return "analytics:tenant:{$dentistId}:version";
    }

    private static function adminKey(): string
    {
        return 'analytics:admin:version';
    }
}
