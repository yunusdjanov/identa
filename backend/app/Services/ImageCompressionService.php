<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

class ImageCompressionService
{
    /**
     * Visual quality strategy: a single pass at high quality. For dental imagery,
     * MAX_EDGE_AUTO=1800 px is more than enough on any practical screen, WEBP q=82
     * and JPEG q=85 are visually lossless for both photos and X-rays.
     *
     * The legacy iterative degradation (WEBP_QUALITIES / JPEG_QUALITIES) is kept
     * as a fallback for when an explicit byte ceiling is passed — admin-driven
     * override path. In auto mode (targetMaxBytes=null) we trust the high-quality
     * result and skip recompression entirely if the source is already efficient.
     */
    private const MAX_EDGE_AUTO = 1800;
    private const MIN_EDGE = 720;
    private const AUTO_WEBP_QUALITY = 82;
    private const AUTO_JPEG_QUALITY = 85;
    /** Output >= 90% of original byte size means recompression is wasted work. */
    private const SKIP_RECOMPRESSION_THRESHOLD = 0.90;
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
     * Optimize image contents.
     *
     * Two modes:
     * - **Auto** (targetMaxBytes=null): single-pass high-quality encode at
     *   {@see AUTO_WEBP_QUALITY}/{@see AUTO_JPEG_QUALITY}, only resizing when the
     *   source exceeds {@see MAX_EDGE_AUTO}. If the recompressed output is not
     *   meaningfully smaller than the source AND no resize happened, the source
     *   is returned unchanged to avoid pointless quality loss on already-optimized
     *   files. This is the default path — admins don't have to tune anything.
     * - **Ceiling** (targetMaxBytes set): the legacy iterative degradation kicks
     *   in if the auto result still exceeds the explicit byte ceiling. Used when
     *   a hard cap is required (currently no callers in auto mode).
     *
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

            $autoResult = $this->encodeAuto($source, $contents, $fallbackMimeType, $sourceWidth, $sourceHeight);

            // Auto mode: trust the single-pass high-quality result.
            if ($targetMaxBytes === null) {
                return $autoResult;
            }

            // Ceiling mode: if auto already fits under the cap, we're done.
            if ($autoResult !== null && $autoResult['file_size'] <= $targetMaxBytes) {
                return $autoResult;
            }

            // Otherwise degrade iteratively to honor the explicit ceiling.
            return $this->encodeWithCeiling($source, $sourceWidth, $sourceHeight, $targetMaxBytes);
        } finally {
            imagedestroy($source);
        }
    }

    /**
     * Single-pass high-quality encode. Resizes only when source exceeds the
     * auto ceiling. Skips recompression when it would barely save space.
     *
     * @param  resource|object  $source
     * @return array{contents: string, mime_type: string, extension: string, file_size: int}|null
     */
    private function encodeAuto(mixed $source, string $sourceContents, ?string $sourceMimeType, int $sourceWidth, int $sourceHeight): ?array
    {
        $largestEdge = max($sourceWidth, $sourceHeight);
        $needsResize = $largestEdge > self::MAX_EDGE_AUTO;
        $targetEdge = $needsResize ? self::MAX_EDGE_AUTO : $largestEdge;

        $target = $this->resizeImage($source, $sourceWidth, $sourceHeight, $targetEdge);
        if ($target === null) {
            return null;
        }

        try {
            $best = null;
            foreach ($this->autoEncodingCandidates() as $candidate) {
                $encoded = $this->encodeImage($target, $candidate['mime_type'], $candidate['quality']);
                if ($encoded === null) {
                    continue;
                }
                $fileSize = strlen($encoded);
                if ($best === null || $fileSize < $best['file_size']) {
                    $best = [
                        'contents' => $encoded,
                        'mime_type' => $candidate['mime_type'],
                        'extension' => $candidate['extension'],
                        'file_size' => $fileSize,
                    ];
                }
            }

            if ($best === null) {
                return null;
            }

            // Smart skip: when the source wasn't resized and recompression barely
            // shrinks the file, prefer the original bytes (no cumulative quality loss).
            $sourceSize = strlen($sourceContents);
            if (! $needsResize && $sourceSize > 0 && $best['file_size'] >= (int) round($sourceSize * self::SKIP_RECOMPRESSION_THRESHOLD)) {
                $normalizedMime = $this->normalizeMimeType($sourceMimeType);

                return [
                    'contents' => $sourceContents,
                    'mime_type' => $normalizedMime,
                    'extension' => $this->extensionForMimeType($normalizedMime),
                    'file_size' => $sourceSize,
                ];
            }

            return $best;
        } finally {
            imagedestroy($target);
        }
    }

    /**
     * Legacy iterative degradation used when an explicit byte ceiling is set.
     *
     * @param  resource|object  $source
     * @return array{contents: string, mime_type: string, extension: string, file_size: int}|null
     */
    private function encodeWithCeiling(mixed $source, int $sourceWidth, int $sourceHeight, int $targetMaxBytes): ?array
    {
        $largestEdge = max($sourceWidth, $sourceHeight);
        $candidateEdges = array_values(array_unique(array_filter([
            min($largestEdge, self::MAX_EDGE_AUTO),
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
                        if ($fileSize <= $targetMaxBytes) {
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
    }

    /**
     * @return list<array{mime_type: string, extension: string, quality: int}>
     */
    private function autoEncodingCandidates(): array
    {
        $candidates = [];
        if (function_exists('imagewebp')) {
            $candidates[] = [
                'mime_type' => 'image/webp',
                'extension' => 'webp',
                'quality' => self::AUTO_WEBP_QUALITY,
            ];
        }

        $candidates[] = [
            'mime_type' => 'image/jpeg',
            'extension' => 'jpg',
            'quality' => self::AUTO_JPEG_QUALITY,
        ];

        return $candidates;
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
