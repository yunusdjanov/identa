<?php

namespace App\Jobs;

use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\PatientClinicalPhoto;
use App\Models\TreatmentImage;
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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProcessUploadedMedia implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    private const JPEG_VARIANT_QUALITY = 82;

    private const WEBP_VARIANT_QUALITY = 80;

    /**
     * @var list<class-string<Model>>
     */
    private const MEDIA_MODELS = [
        Patient::class,
        PatientClinicalPhoto::class,
        TreatmentImage::class,
        OdontogramEntryImage::class,
    ];

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
            $this->reject($record, $quarantinePath, ScanResult::failed('internal', 'Quarantine object missing.'));

            return;
        }

        $contents = Storage::disk($disk)->get($quarantinePath);
        $scanResult = $scanner->scanString($contents);
        if (! $scanResult->isClean()) {
            $this->reject($record, $quarantinePath, $scanResult);

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
                $this->reject($record, $quarantinePath, ScanResult::failed('sanitizer', 'Unable to sanitize image.'));

                return;
            }

            $approvedPath = $this->approvedPath($quarantinePath, $optimized['extension']);
            if (! Storage::disk($disk)->put($approvedPath, $optimized['contents'])) {
                throw new \RuntimeException('Unable to persist approved media.');
            }
            MediaPathCache::markPresent($disk, $approvedPath);

            $transition = $this->transitionToApproved(
                expectedQuarantinePath: $quarantinePath,
                disk: $disk,
                approvedPath: $approvedPath,
                mimeType: $optimized['mime_type'],
                fileSize: $optimized['file_size'],
                scanResult: $scanResult,
            );
            if ($transition === null) {
                $this->deleteStaleUploadPaths($disk, [$quarantinePath, $approvedPath]);

                return;
            }

            $record = $transition['record'];
            $this->queueQuarantineDeletion($record, $disk, $quarantinePath);
            $this->queueApprovedMediaVariants($record, $disk, $approvedPath);
            $this->queuePreviousMediaDeletion(
                $record,
                $transition['previous_disk'],
                $transition['previous_path'],
                $quarantinePath,
                $approvedPath
            );
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
        if (! in_array($this->modelClass, self::MEDIA_MODELS, true)) {
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

    private function reject(Model $record, string $expectedQuarantinePath, ScanResult $scanResult): void
    {
        $disk = $this->recordDisk($record);
        $transition = DB::transaction(function () use ($expectedQuarantinePath, $scanResult): ?array {
            $lockedRecord = $this->resolveRecordForUpdate();
            if (
                $lockedRecord === null
                || (string) $lockedRecord->getAttribute('scan_status') !== 'pending'
                || (string) $lockedRecord->getAttribute('quarantine_path') !== $expectedQuarantinePath
            ) {
                return null;
            }

            $retained = $this->hasRetainedApprovedMedia($lockedRecord, $expectedQuarantinePath);
            $lockedRecord->forceFill([
                'scan_status' => $retained ? 'approved' : 'rejected',
                'scan_result' => $scanResult->message,
                'scan_provider' => $scanResult->provider,
                'scanned_at' => now(),
                'rejected_at' => now(),
                'quarantine_path' => null,
            ])->save();

            return [
                'record' => $lockedRecord,
                'retained' => $retained,
            ];
        });

        $this->deleteStaleUploadPaths($disk, [$expectedQuarantinePath]);
        if ($transition === null) {
            return;
        }

        /** @var Model $record */
        $record = $transition['record'];
        if ($transition['retained']) {
            Log::warning('Uploaded media replacement rejected; previous media retained.', [
                'model' => $record::class,
                'record_ref' => $this->recordReference($record),
                'provider' => $scanResult->provider,
                'status' => $scanResult->status,
            ]);

            return;
        }

        Log::warning('Uploaded media rejected.', [
            'model' => $record::class,
            'record_ref' => $this->recordReference($record),
            'provider' => $scanResult->provider,
            'status' => $scanResult->status,
        ]);
    }

    /**
     * Persist approval only if the row still references the object that was
     * scanned. A newer upload or deletion must win over this stale job.
     *
     * @return array{record: Model, previous_disk: string, previous_path: string}|null
     */
    private function transitionToApproved(
        string $expectedQuarantinePath,
        string $disk,
        string $approvedPath,
        string $mimeType,
        int $fileSize,
        ScanResult $scanResult
    ): ?array {
        return DB::transaction(function () use (
            $expectedQuarantinePath,
            $disk,
            $approvedPath,
            $mimeType,
            $fileSize,
            $scanResult
        ): ?array {
            $lockedRecord = $this->resolveRecordForUpdate();
            if (
                $lockedRecord === null
                || (string) $lockedRecord->getAttribute('scan_status') !== 'pending'
                || (string) $lockedRecord->getAttribute('quarantine_path') !== $expectedQuarantinePath
            ) {
                return null;
            }

            $previousDisk = $this->recordDisk($lockedRecord);
            $previousPath = $this->currentMediaPath($lockedRecord);
            $lockedRecord->forceFill($this->approvedAttributes(
                $lockedRecord,
                $disk,
                $approvedPath,
                $mimeType,
                $fileSize,
                $scanResult,
            ))->save();

            return [
                'record' => $lockedRecord,
                'previous_disk' => $previousDisk,
                'previous_path' => $previousPath,
            ];
        });
    }

    private function resolveRecordForUpdate(): ?Model
    {
        if (! in_array($this->modelClass, self::MEDIA_MODELS, true)) {
            return null;
        }

        /** @var Model|null $record */
        $record = $this->modelClass::query()
            ->whereKey($this->modelId)
            ->lockForUpdate()
            ->first();

        return $record;
    }

    /**
     * Remove an object that no current media row can reference. This happens
     * when a newer upload or deletion wins while the older object is scanning.
     *
     * @param list<string> $paths
     */
    private function deleteStaleUploadPaths(string $disk, array $paths): void
    {
        $paths = array_values(array_unique(array_filter(array_map('trim', $paths))));
        if ($disk === '' || $paths === []) {
            return;
        }

        Storage::disk($disk)->delete($paths);
        MediaPathCache::forgetPaths($disk, $paths);
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
