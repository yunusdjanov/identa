<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

class ImageCompressionService
{
    private const MAX_EDGE = 1800;
    private const MIN_EDGE = 720;
    private const WEBP_QUALITIES = [82, 76, 70, 64, 58];
    private const JPEG_QUALITIES = [84, 78, 72, 66, 60];

    /**
     * @return array{contents: string, mime_type: string, extension: string, file_size: int}|null
     */
    public function optimizeUploadedFile(UploadedFile $file, ?int $targetMaxBytes): ?array
    {
        $realPath = $file->getRealPath();
        if (! is_string($realPath) || $realPath === '') {
            return null;
        }

        $contents = @file_get_contents($realPath);
        if (! is_string($contents) || $contents === '') {
            return null;
        }

        return $this->optimizeContents(
            contents: $contents,
            fallbackMimeType: $file->getClientMimeType(),
            targetMaxBytes: $targetMaxBytes
        );
    }

    /**
     * @return array{disk: string, path: string, mime_type: string, file_size: int}
     */
    public function optimizeStoredObject(string $disk, string $path, ?int $targetMaxBytes): array
    {
        $contents = Storage::disk($disk)->get($path);
        $optimized = $this->optimizeContents(
            contents: $contents,
            fallbackMimeType: $this->guessMimeType($path),
            targetMaxBytes: $targetMaxBytes
        );

        if ($optimized === null) {
            throw new RuntimeException('Unable to sanitize image.');
        }

        $targetPath = $this->replaceExtension($path, $optimized['extension']);
        if ($targetPath === $path) {
            Storage::disk($disk)->put($path, $optimized['contents']);
        } else {
            Storage::disk($disk)->put($targetPath, $optimized['contents']);
            Storage::disk($disk)->delete($path);
        }

        return [
            'disk' => $disk,
            'path' => $targetPath,
            'mime_type' => $optimized['mime_type'],
            'file_size' => $optimized['file_size'],
        ];
    }

    /**
     * @return array{contents: string, mime_type: string, extension: string, file_size: int}|null
     */
    public function optimizeContents(string $contents, ?string $fallbackMimeType, ?int $targetMaxBytes): ?array
    {
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagecreatetruecolor')) {
            return null;
        }

        $source = @imagecreatefromstring($contents);
        if (! is_object($source) && ! is_resource($source)) {
            return null;
        }

        try {
            $sourceWidth = imagesx($source);
            $sourceHeight = imagesy($source);
            if ($sourceWidth <= 0 || $sourceHeight <= 0) {
                return null;
            }

            $largestEdge = max($sourceWidth, $sourceHeight);
            $candidateEdges = array_values(array_unique(array_filter([
                min($largestEdge, self::MAX_EDGE),
                1600,
                1400,
                1200,
                1000,
                self::MIN_EDGE,
            ], static fn (int $edge): bool => $edge > 0 && $edge <= $largestEdge)));

            foreach ($candidateEdges as $maxEdge) {
                $target = $this->resizeImage($source, $sourceWidth, $sourceHeight, $maxEdge);
                if ($target === null) {
                    continue;
                }

                try {
                    foreach ($this->encodingCandidates() as $candidate) {
                        foreach ($candidate['qualities'] as $quality) {
                            $encoded = $this->encodeImage($target, $candidate['mime_type'], $quality);
                            if ($encoded === null) {
                                continue;
                            }

                            $fileSize = strlen($encoded);
                            if ($targetMaxBytes === null || $fileSize <= $targetMaxBytes) {
                                return [
                                    'contents' => $encoded,
                                    'mime_type' => $candidate['mime_type'],
                                    'extension' => $candidate['extension'],
                                    'file_size' => $fileSize,
                                ];
                            }
                        }
                    }
                } finally {
                    imagedestroy($target);
                }
            }

            return null;
        } finally {
            imagedestroy($source);
        }
    }

    /**
     * @param resource|object $source
     * @return resource|object|null
     */
    private function resizeImage(mixed $source, int $sourceWidth, int $sourceHeight, int $maxEdge): mixed
    {
        $ratio = min(1, $maxEdge / max($sourceWidth, $sourceHeight));
        $targetWidth = max(1, (int) round($sourceWidth * $ratio));
        $targetHeight = max(1, (int) round($sourceHeight * $ratio));
        $target = imagecreatetruecolor($targetWidth, $targetHeight);

        if (! is_object($target) && ! is_resource($target)) {
            return null;
        }

        imagealphablending($target, false);
        imagesavealpha($target, true);
        imagecopyresampled($target, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $sourceWidth, $sourceHeight);

        return $target;
    }

    /**
     * @return list<array{mime_type: string, extension: string, qualities: list<int>}>
     */
    private function encodingCandidates(): array
    {
        $candidates = [];
        if (function_exists('imagewebp')) {
            $candidates[] = [
                'mime_type' => 'image/webp',
                'extension' => 'webp',
                'qualities' => self::WEBP_QUALITIES,
            ];
        }

        $candidates[] = [
            'mime_type' => 'image/jpeg',
            'extension' => 'jpg',
            'qualities' => self::JPEG_QUALITIES,
        ];

        return $candidates;
    }

    /**
     * @param resource|object $image
     */
    private function encodeImage(mixed $image, string $mimeType, int $quality): ?string
    {
        ob_start();
        $encoded = match ($mimeType) {
            'image/webp' => function_exists('imagewebp') ? imagewebp($image, null, $quality) : false,
            default => imagejpeg($image, null, $quality),
        };
        $contents = ob_get_clean();

        if (! $encoded || ! is_string($contents) || $contents === '') {
            return null;
        }

        return $contents;
    }

    private function replaceExtension(string $path, string $extension): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME) ?: Str::uuid()->toString();
        $directory = $directory === '.' ? '' : trim($directory, '/');

        return ($directory !== '' ? $directory.'/' : '').$filename.'.'.$extension;
    }

    private function guessMimeType(string $path): string
    {
        return match (strtolower(pathinfo($path, PATHINFO_EXTENSION) ?: '')) {
            'png' => 'image/png',
            'webp' => 'image/webp',
            'jpg', 'jpeg' => 'image/jpeg',
            default => 'application/octet-stream',
        };
    }

    private function normalizeMimeType(?string $mimeType): string
    {
        $normalized = strtolower(trim((string) $mimeType));

        return in_array($normalized, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'], true)
            ? ($normalized === 'image/jpg' ? 'image/jpeg' : $normalized)
            : 'image/jpeg';
    }

    private function extensionForMimeType(?string $mimeType): string
    {
        return match ($this->normalizeMimeType($mimeType)) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };
    }
}
