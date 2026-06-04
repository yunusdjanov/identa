<?php

namespace App\Jobs;

use App\Models\Patient;
use App\Models\User;
use App\Services\ImageCompressionService;
use App\Services\Media\AntivirusScanner;
use App\Services\Media\ScanResult;
use App\Services\PlanLimitService;
use App\Support\MediaPathCache;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProcessUploadedMedia implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

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
    }

    public function handle(
        AntivirusScanner $scanner,
        ImageCompressionService $imageCompressionService,
        PlanLimitService $planLimitService,
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
            Storage::disk($disk)->put($approvedPath, $optimized['contents']);
            Storage::disk($disk)->delete($quarantinePath);
            MediaPathCache::forgetPaths($disk, [$quarantinePath]);
            MediaPathCache::markPresent($disk, $approvedPath);

            $record->forceFill($this->approvedAttributes(
                $record,
                $disk,
                $approvedPath,
                $optimized['mime_type'],
                $optimized['file_size'],
                $scanResult,
            ))->save();
        } catch (\Throwable $exception) {
            $this->reject($record, ScanResult::failed('sanitizer', $exception->getMessage()));
        }
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

        $record->forceFill([
            'scan_status' => 'rejected',
            'scan_result' => $scanResult->message,
            'scan_provider' => $scanResult->provider,
            'scanned_at' => now(),
            'rejected_at' => now(),
        ])->save();

        Log::warning('Uploaded media rejected.', [
            'model' => $record::class,
            'id' => $record->getKey(),
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
}
