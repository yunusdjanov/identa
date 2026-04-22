<?php

namespace App\Jobs;

use App\Support\MediaPathCache;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class DeleteStoredMediaPaths implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 120;

    /**
     * @param list<string> $paths
     */
    public function __construct(
        public string $disk,
        public array $paths,
        public string $logContext = 'Stored media',
    ) {
        $this->afterCommit();
    }

    public function handle(): void
    {
        $disk = trim($this->disk);
        $paths = array_values(array_unique(array_filter(
            array_map(
                static fn (mixed $path): string => is_string($path) ? trim($path) : '',
                $this->paths
            ),
            static fn (string $path): bool => $path !== ''
        )));

        if ($disk === '' || $paths === []) {
            return;
        }

        try {
            Storage::disk($disk)->delete($paths);
            MediaPathCache::forgetPaths($disk, $paths);
        } catch (\Throwable $exception) {
            Log::warning($this->logContext.' deletion failed.', [
                'exception' => $exception::class,
                'disk' => $disk,
                'path_count' => count($paths),
            ]);
        }
    }
}
