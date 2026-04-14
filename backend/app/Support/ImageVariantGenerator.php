<?php

namespace App\Support;

class ImageVariantGenerator
{
    /**
     * @return array{contents: string, mime_type: string}|null
     */
    public static function make(
        string $contents,
        string $path,
        int $maxEdge,
        int $jpegQuality = 82,
        int $webpQuality = 80,
    ): ?array {
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagecreatetruecolor')) {
            return null;
        }

        $source = @imagecreatefromstring($contents);
        if (! is_object($source) && ! is_resource($source)) {
            return null;
        }

        try {
            return self::encode($source, $path, $maxEdge, $jpegQuality, $webpQuality);
        } finally {
            imagedestroy($source);
        }
    }

    /**
     * @param resource|object $source
     * @return array{contents: string, mime_type: string}|null
     */
    private static function encode(
        mixed $source,
        string $path,
        int $maxEdge,
        int $jpegQuality,
        int $webpQuality,
    ): ?array {
        $sourceWidth = imagesx($source);
        $sourceHeight = imagesy($source);
        if ($sourceWidth <= 0 || $sourceHeight <= 0) {
            return null;
        }

        $ratio = min(1, $maxEdge / max($sourceWidth, $sourceHeight));
        if ($ratio >= 1) {
            return null;
        }

        $targetWidth = max(1, (int) round($sourceWidth * $ratio));
        $targetHeight = max(1, (int) round($sourceHeight * $ratio));
        $target = imagecreatetruecolor($targetWidth, $targetHeight);

        if (! is_object($target) && ! is_resource($target)) {
            return null;
        }

        imagealphablending($target, false);
        imagesavealpha($target, true);
        imagecopyresampled($target, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $sourceWidth, $sourceHeight);

        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg');
        $mimeType = match ($extension) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            default => 'image/jpeg',
        };

        try {
            ob_start();
            $encoded = match ($extension) {
                'png' => imagepng($target, null, 7),
                'webp' => function_exists('imagewebp') ? imagewebp($target, null, $webpQuality) : false,
                default => imagejpeg($target, null, $jpegQuality),
            };
            $encodedContents = ob_get_clean();

            if (! $encoded || ! is_string($encodedContents) || $encodedContents === '') {
                return null;
            }

            return [
                'contents' => $encodedContents,
                'mime_type' => $mimeType,
            ];
        } finally {
            imagedestroy($target);
        }
    }
}
