<?php

namespace App\Services\Media;

final readonly class ScanResult
{
    public function __construct(
        public string $status,
        public string $provider,
        public ?string $message = null,
    ) {
    }

    public static function clean(string $provider, ?string $message = null): self
    {
        return new self('clean', $provider, $message);
    }

    public static function infected(string $provider, ?string $message = null): self
    {
        return new self('infected', $provider, $message);
    }

    public static function failed(string $provider, ?string $message = null): self
    {
        return new self('failed', $provider, $message);
    }

    public function isClean(): bool
    {
        return $this->status === 'clean';
    }
}
