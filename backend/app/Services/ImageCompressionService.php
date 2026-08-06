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
     * result. Approved media is always re-encoded so EXIF/GPS metadata and
     * trailing non-image bytes never reach long-lived storage.
     */
    private const MAX_EDGE_AUTO = 1800;
    private const MIN_EDGE = 720;
    private const AUTO_WEBP_QUALITY = 82;
    private const AUTO_JPEG_QUALITY = 85;
    private const WEBP_QUALITIES = [82, 76, 70, 64, 58];
    private const JPEG_QUALITIES = [84, 78, 72, 66, 60];

    /**
     * Decompression-bomb ceiling. A few-KB image can declare enormous pixel
     * dimensions that explode to gigabytes of raw bitmap the moment
     * imagecreatefromstring() allocates the canvas, OOM-killing the queue
     * worker. 40 MP is far above any legitimate dental photo/X-ray (capped to
     * 1800 px on the longest edge after optimization) while rejecting bombs.
     */
    private const MAX_SOURCE_PIXELS = 40_000_000;

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
        if (! Storage::disk($disk)->put($targetPath, $optimized['contents'])) {
            throw new RuntimeException('Unable to persist optimized image.');
        }

        if ($targetPath !== $path) {
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
     *   source exceeds {@see MAX_EDGE_AUTO}. The decoded bitmap is always
     *   re-encoded to strip metadata and trailing bytes. This remains the
     *   default path for all accepted uploads.
     * - **Ceiling** (targetMaxBytes set): the legacy iterative degradation kicks
     *   in if the auto result still exceeds the explicit byte ceiling. Used when
     *   a hard cap is required (currently no callers in auto mode).
     *
     * @return array{contents: string, mime_type: string, extension: string, file_size: int}|null
     */
    public function optimizeContents(string $contents, ?string $fallbackMimeType, ?int $targetMaxBytes): ?array
    {
        unset($fallbackMimeType);

        if (! function_exists('imagecreatefromstring') || ! function_exists('imagecreatetruecolor')) {
            return null;
        }

        // Reject decompression bombs using the cheap header read BEFORE the
        // full bitmap is decoded into memory. Fails closed (null) like any
        // other unprocessable input.
        $dimensions = @getimagesizefromstring($contents);
        if (is_array($dimensions)) {
            $declaredWidth = (int) ($dimensions[0] ?? 0);
            $declaredHeight = (int) ($dimensions[1] ?? 0);
            if ($declaredWidth > 0
                && $declaredHeight > 0
                && ($declaredWidth * $declaredHeight) > self::MAX_SOURCE_PIXELS) {
                return null;
            }
        }

        $source = @imagecreatefromstring($contents);
        if (! is_object($source) && ! is_resource($source)) {
            return null;
        }

        try {
            $orientedSource = $this->applyExifOrientation($source, $this->jpegExifOrientation($contents));
            if ($orientedSource !== $source) {
                imagedestroy($source);
                $source = $orientedSource;
            }

            $sourceWidth = imagesx($source);
            $sourceHeight = imagesy($source);
            if ($sourceWidth <= 0 || $sourceHeight <= 0) {
                return null;
            }

            $autoResult = $this->encodeAuto($source, $sourceWidth, $sourceHeight);

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
     * auto ceiling and always returns sanitized, newly encoded bytes.
     *
     * @param  resource|object  $source
     * @return array{contents: string, mime_type: string, extension: string, file_size: int}|null
     */
    private function encodeAuto(mixed $source, int $sourceWidth, int $sourceHeight): ?array
    {
        $largestEdge = max($sourceWidth, $sourceHeight);
        $needsResize = $largestEdge > self::MAX_EDGE_AUTO;
        $targetEdge = $needsResize ? self::MAX_EDGE_AUTO : $largestEdge;

        $target = $this->resizeImage($source, $sourceWidth, $sourceHeight, $targetEdge);
        if ($target === null) {
            return null;
        }

        try {
            $candidate = $this->autoEncodingCandidate($target);
            $encoded = $this->encodeImage($target, $candidate['mime_type'], $candidate['quality']);
            if ($encoded === null && $candidate['mime_type'] === 'image/webp') {
                $candidate = $this->fallbackEncodingCandidate($target);
                $encoded = $this->encodeImage($target, $candidate['mime_type'], $candidate['quality']);
            }
            if ($encoded === null) {
                return null;
            }

            return [
                'contents' => $encoded,
                'mime_type' => $candidate['mime_type'],
                'extension' => $candidate['extension'],
                'file_size' => strlen($encoded),
            ];
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
                foreach ($this->encodingCandidates($this->hasTransparency($target)) as $candidate) {
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
     * WebP preserves alpha and is the preferred production format. Choosing a
     * single encoder avoids both a full alpha scan and a second encode on every
     * normal upload. Hosts without WebP retain the PNG/JPEG fallback.
     *
     * @param  resource|object  $image
     * @return array{mime_type: string, extension: string, quality: int}
     */
    private function autoEncodingCandidate(mixed $image): array
    {
        if (function_exists('imagewebp')) {
            return [
                'mime_type' => 'image/webp',
                'extension' => 'webp',
                'quality' => self::AUTO_WEBP_QUALITY,
            ];
        }

        return $this->fallbackEncodingCandidate($image);
    }

    /**
     * @param  resource|object  $image
     * @return array{mime_type: string, extension: string, quality: int}
     */
    private function fallbackEncodingCandidate(mixed $image): array
    {
        if ($this->hasTransparency($image)) {
            return [
                'mime_type' => 'image/png',
                'extension' => 'png',
                'quality' => 6,
            ];
        }

        return [
            'mime_type' => 'image/jpeg',
            'extension' => 'jpg',
            'quality' => self::AUTO_JPEG_QUALITY,
        ];
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
    private function encodingCandidates(bool $preserveTransparency): array
    {
        $candidates = [];
        if (function_exists('imagewebp')) {
            $candidates[] = [
                'mime_type' => 'image/webp',
                'extension' => 'webp',
                'qualities' => self::WEBP_QUALITIES,
            ];
        }

        if ($preserveTransparency) {
            $candidates[] = [
                'mime_type' => 'image/png',
                'extension' => 'png',
                'qualities' => [6],
            ];
        } else {
            $candidates[] = [
                'mime_type' => 'image/jpeg',
                'extension' => 'jpg',
                'qualities' => self::JPEG_QUALITIES,
            ];
        }

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
            'image/png' => imagepng($image, null, $quality),
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

    /**
     * @param resource|object $image
     */
    private function hasTransparency(mixed $image): bool
    {
        if (imagecolortransparent($image) >= 0) {
            return true;
        }

        $width = imagesx($image);
        $height = imagesy($image);
        for ($y = 0; $y < $height; $y++) {
            for ($x = 0; $x < $width; $x++) {
                if (((imagecolorat($image, $x, $y) >> 24) & 0x7f) > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @param resource|object $source
     * @return resource|object
     */
    private function applyExifOrientation(mixed $source, int $orientation): mixed
    {
        return match ($orientation) {
            2 => $this->flippedImage($source, IMG_FLIP_HORIZONTAL),
            3 => $this->rotatedImage($source, 180),
            4 => $this->flippedImage($source, IMG_FLIP_VERTICAL),
            5 => $this->flippedAndRotatedImage($source, IMG_FLIP_HORIZONTAL, 90),
            6 => $this->rotatedImage($source, -90),
            7 => $this->flippedAndRotatedImage($source, IMG_FLIP_HORIZONTAL, -90),
            8 => $this->rotatedImage($source, 90),
            default => $source,
        };
    }

    /**
     * @param resource|object $source
     * @return resource|object
     */
    private function flippedImage(mixed $source, int $mode): mixed
    {
        $copy = $this->resizeImage(
            $source,
            imagesx($source),
            imagesy($source),
            max(imagesx($source), imagesy($source))
        );
        if ($copy === null || ! imageflip($copy, $mode)) {
            return $source;
        }

        return $copy;
    }

    /**
     * @param resource|object $source
     * @return resource|object
     */
    private function rotatedImage(mixed $source, int $angle): mixed
    {
        $rotated = imagerotate($source, $angle, 0);

        return is_object($rotated) || is_resource($rotated) ? $rotated : $source;
    }

    /**
     * @param resource|object $source
     * @return resource|object
     */
    private function flippedAndRotatedImage(mixed $source, int $flipMode, int $angle): mixed
    {
        $flipped = $this->flippedImage($source, $flipMode);
        $rotated = $this->rotatedImage($flipped, $angle);
        if ($flipped !== $source && $rotated !== $flipped) {
            imagedestroy($flipped);
        }

        return $rotated;
    }

    private function jpegExifOrientation(string $contents): int
    {
        if (strlen($contents) < 4 || substr($contents, 0, 2) !== "\xFF\xD8") {
            return 1;
        }

        $length = strlen($contents);
        $offset = 2;
        while ($offset + 4 <= $length) {
            if (ord($contents[$offset]) !== 0xFF) {
                break;
            }

            $marker = ord($contents[$offset + 1]);
            $offset += 2;
            if ($marker === 0xD9 || $marker === 0xDA) {
                break;
            }

            $segmentLength = $this->readUnsigned16($contents, $offset, false);
            if ($segmentLength < 2 || $offset + $segmentLength > $length) {
                break;
            }

            if ($marker === 0xE1 && substr($contents, $offset + 2, 6) === "Exif\x00\x00") {
                return $this->tiffOrientation(substr($contents, $offset + 8, $segmentLength - 8));
            }

            $offset += $segmentLength;
        }

        return 1;
    }

    private function tiffOrientation(string $tiff): int
    {
        if (strlen($tiff) < 8) {
            return 1;
        }

        $littleEndian = substr($tiff, 0, 2) === 'II';
        if (! $littleEndian && substr($tiff, 0, 2) !== 'MM') {
            return 1;
        }

        if ($this->readUnsigned16($tiff, 2, $littleEndian) !== 42) {
            return 1;
        }

        $ifdOffset = $this->readUnsigned32($tiff, 4, $littleEndian);
        if ($ifdOffset < 0 || $ifdOffset + 2 > strlen($tiff)) {
            return 1;
        }

        $entryCount = $this->readUnsigned16($tiff, $ifdOffset, $littleEndian);
        for ($index = 0; $index < $entryCount; $index++) {
            $entryOffset = $ifdOffset + 2 + ($index * 12);
            if ($entryOffset + 12 > strlen($tiff)) {
                break;
            }

            if (
                $this->readUnsigned16($tiff, $entryOffset, $littleEndian) === 0x0112
                && $this->readUnsigned16($tiff, $entryOffset + 2, $littleEndian) === 3
                && $this->readUnsigned32($tiff, $entryOffset + 4, $littleEndian) === 1
            ) {
                $orientation = $this->readUnsigned16($tiff, $entryOffset + 8, $littleEndian);

                return in_array($orientation, range(1, 8), true) ? $orientation : 1;
            }
        }

        return 1;
    }

    private function readUnsigned16(string $contents, int $offset, bool $littleEndian): int
    {
        if ($offset < 0 || $offset + 2 > strlen($contents)) {
            return -1;
        }

        $value = unpack($littleEndian ? 'vvalue' : 'nvalue', substr($contents, $offset, 2));

        return (int) ($value['value'] ?? -1);
    }

    private function readUnsigned32(string $contents, int $offset, bool $littleEndian): int
    {
        if ($offset < 0 || $offset + 4 > strlen($contents)) {
            return -1;
        }

        $value = unpack($littleEndian ? 'Vvalue' : 'Nvalue', substr($contents, $offset, 4));

        return (int) ($value['value'] ?? -1);
    }
}
