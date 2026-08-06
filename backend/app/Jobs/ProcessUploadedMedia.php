<?php

namespace App\Jobs;

use App\Models\Patient;
use App\Models\User;
use App\Services\ImageCompressionService;
use App\Services\Media\AntivirusScanner;
use App\Services\Media\ScanResult;
use App\Support\MediaPathCache;
use App\Support\MediaVariantPaths;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProcessUploadedMedia implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private const JPEG_VARIANT_QUALITY = 82;

    private const WEBP_VARIANT_QUALITY = 80;

    public int $tries = 3;

    public int $timeout = 180;

    /**
     * @param class-string<Model> $modelClass
     */
    public function __construct(
        public string $modelClass,
        public string $modelId,
        public int $ownerId,
    ) {
        $this->afterCommit();
        $this->onQueue('media');
    }

    public function handle(
        AntivirusScanner $scanner,
        ImageCompressionService $imageCompressionService,
    ): void {
        $record = $this->resolveRecord();
        if ($record === null || (string) $record->getAttribute('scan_status') !== 'pending') {
            return;
        }

        $disk = $this->recordDisk($record);
        $quarantinePath = (string) $record->getAttribute('quarantine_path');
        if ($disk === '' || $quarantinePath === '' || ! Storage::disk($disk)->exists($quarantinePath)) {
            $this->reject($record, ScanResult::failed('internal', 'Quarantine object missing.'));

            return;
        }

        $contents = Storage::disk($disk)->get($quarantinePath);
        $scanResult = $scanner->scanString($contents);
        if (! $scanResult->isClean()) {
            $this->reject($record, $scanResult);

            return;
        }

        try {
            // Auto compression: pass null so ImageCompressionService picks the
            // best quality/size single-pass result. The legacy per-plan ceiling
            // (stored_image_max_mb) is no longer enforced — upload_max_mb caps
            // the input side and is enough to bound storage in practice.
            $optimized = $imageCompressionService->optimizeContents(
                contents: $contents,
                fallbackMimeType: (string) ($record->getAttribute('mime_type') ?? 'image/jpeg'),
                targetMaxBytes: null,
            );

            if ($optimized === null) {
                $this->reject($record, ScanResult::failed('sanitizer', 'Unable to sanitize image.'));

                return;
            }

            $approvedPath = $this->approvedPath($quarantinePath, $optimized['extension']);
            $previousDisk = $this->recordDisk($record);
            $previousPath = $this->currentMediaPath($record);
            if (! Storage::disk($disk)->put($approvedPath, $optimized['contents'])) {
                throw new \RuntimeException('Unable to persist approved media.');
            }
            MediaPathCache::markPresent($disk, $approvedPath);

            $record->forceFill($this->approvedAttributes(
                $record,
                $disk,
                $approvedPath,
                $optimized['mime_type'],
                $optimized['file_size'],
                $scanResult,
            ))->save();
            $this->queueQuarantineDeletion($record, $disk, $quarantinePath);
            $this->queueApprovedMediaVariants($record, $disk, $approvedPath);
            $this->queuePreviousMediaDeletion($record, $previousDisk, $previousPath, $quarantinePath, $approvedPath);
        } catch (\Throwable $exception) {
            // Operational failures are not proof that the image is unsafe.
            // Keep the row pending so the queue can retry it.
            throw $exception;
        }
    }

    /**
     * Recovery may enqueue the same pending record more than once. Serialize
     * those jobs so only one scanner can mutate a media row at a time.
     *
     * @return list<WithoutOverlapping>
     */
    public function middleware(): array
    {
        return [
            (new WithoutOverlapping(hash('sha256', $this->modelClass.':'.$this->modelId)))
                ->expireAfter($this->timeout + 60)
                ->dontRelease(),
        ];
    }

    public function failed(\Throwable $exception): void
    {
        $record = $this->resolveRecord();
        if ($record === null || (string) $record->getAttribute('scan_status') !== 'pending') {
            return;
        }

        // Exhausted queue retries indicate an operational failure, not unsafe
        // media. Preserve the quarantine object and pending state so the
        // bounded recovery pass can retry after storage/encoder health returns.
        $record->forceFill([
            'scan_result' => 'Media processing delayed after queue retries.',
            'scan_provider' => 'internal',
            'scanned_at' => now(),
        ])->save();

        Log::warning('Uploaded media processing delayed after queue retries.', [
            'exception' => $exception::class,
            'model' => $record::class,
            'record_ref' => $this->recordReference($record),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function approvedAttributes(
        Model $record,
        string $disk,
        string $approvedPath,
        string $mimeType,
        int $fileSize,
        ScanResult $scanResult
    ): array {
        $attributes = [
                'scan_status' => 'approved',
                'scan_result' => $scanResult->message,
                'scan_provider' => $scanResult->provider,
                'approved_at' => now(),
                'scanned_at' => now(),
                'rejected_at' => null,
                'quarantine_path' => null,
        ];

        if ($record instanceof Patient) {
            return $attributes + [
                'photo_disk' => $disk,
                'photo_path' => $approvedPath,
            ];
        }

        return $attributes + [
            'path' => $approvedPath,
            'mime_type' => $mimeType,
            'file_size' => $fileSize,
        ];
    }

    private function resolveRecord(): ?Model
    {
        if (! is_subclass_of($this->modelClass, Model::class)) {
            return null;
        }

        /** @var Model|null $record */
        $record = $this->modelClass::query()->whereKey($this->modelId)->first();

        return $record;
    }

    private function recordDisk(Model $record): string
    {
        if ($record instanceof Patient) {
            return (string) ($record->getAttribute('photo_disk') ?: config('filesystems.media_disk', 'local'));
        }

        return (string) ($record->getAttribute('disk') ?: config('filesystems.media_disk', 'local'));
    }

    private function reject(Model $record, ScanResult $scanResult): void
    {
        $disk = $this->recordDisk($record);
        $quarantinePath = (string) $record->getAttribute('quarantine_path');
        if ($disk !== '' && $quarantinePath !== '') {
            Storage::disk($disk)->delete($quarantinePath);
            MediaPathCache::forgetPaths($disk, [$quarantinePath]);
        }

        if ($this->hasRetainedApprovedMedia($record, $quarantinePath)) {
            $record->forceFill([
                'scan_status' => 'approved',
                'scan_result' => $scanResult->message,
                'scan_provider' => $scanResult->provider,
                'scanned_at' => now(),
                // Keep the approved media displayable while recording that the
                // attempted replacement itself failed security validation.
                'rejected_at' => now(),
                'quarantine_path' => null,
            ])->save();

            Log::warning('Uploaded media replacement rejected; previous media retained.', [
                'model' => $record::class,
                'record_ref' => $this->recordReference($record),
                'provider' => $scanResult->provider,
                'status' => $scanResult->status,
            ]);

            return;
        }

        $record->forceFill([
            'scan_status' => 'rejected',
            'scan_result' => $scanResult->message,
            'scan_provider' => $scanResult->provider,
            'scanned_at' => now(),
            'rejected_at' => now(),
            'quarantine_path' => null,
        ])->save();

        Log::warning('Uploaded media rejected.', [
            'model' => $record::class,
            'record_ref' => $this->recordReference($record),
            'provider' => $scanResult->provider,
            'status' => $scanResult->status,
        ]);
    }

    private function approvedPath(string $quarantinePath, string $extension): string
    {
        $path = preg_replace('#^quarantine/#', 'approved/', ltrim($quarantinePath, '/')) ?: $quarantinePath;
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME) ?: Str::uuid()->toString();
        $directory = $directory === '.' ? '' : trim($directory, '/');

        return ($directory !== '' ? $directory.'/' : '').$filename.'.'.strtolower($extension);
    }

    private function currentMediaPath(Model $record): string
    {
        if ($record instanceof Patient) {
            return trim((string) $record->getAttribute('photo_path'));
        }

        return trim((string) $record->getAttribute('path'));
    }

    private function hasRetainedApprovedMedia(Model $record, string $quarantinePath): bool
    {
        $path = $this->currentMediaPath($record);

        return $path !== '' && $path !== $quarantinePath;
    }

    private function queueApprovedMediaVariants(Model $record, string $disk, string $approvedPath): void
    {
        $variants = MediaVariantPaths::definitions($record, $approvedPath);
        if ($disk === '' || $approvedPath === '' || $variants === []) {
            return;
        }

        GenerateMediaVariants::dispatch(
            disk: $disk,
            sourcePath: $approvedPath,
            variants: $variants,
            logContext: MediaVariantPaths::logContext($record),
            jpegQuality: self::JPEG_VARIANT_QUALITY,
            webpQuality: self::WEBP_VARIANT_QUALITY,
        );
    }

    private function queueQuarantineDeletion(Model $record, string $disk, string $quarantinePath): void
    {
        if ($disk === '' || $quarantinePath === '') {
            return;
        }

        DeleteStoredMediaPaths::dispatch(
            disk: $disk,
            paths: [$quarantinePath],
            logContext: MediaVariantPaths::logContext($record).' quarantine'
        );
    }

    private function queuePreviousMediaDeletion(
        Model $record,
        string $disk,
        string $previousPath,
        string $quarantinePath,
        string $approvedPath
    ): void {
        if (
            $disk === ''
            || $previousPath === ''
            || $previousPath === $quarantinePath
            || $previousPath === $approvedPath
        ) {
            return;
        }

        DeleteStoredMediaPaths::dispatch(
            disk: $disk,
            paths: MediaVariantPaths::deletePaths($record, $previousPath),
            logContext: MediaVariantPaths::logContext($record)
        );
    }

    private function recordReference(Model $record): string
    {
        return hash('sha256', $record::class.':'.(string) $record->getKey());
    }
}
