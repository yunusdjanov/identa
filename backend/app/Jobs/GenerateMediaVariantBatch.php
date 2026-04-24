<?php

namespace App\Jobs;

use App\Support\ImageVariantGenerator;
use App\Support\MediaPathCache;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class GenerateMediaVariantBatch implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 300;

    /**
     * @param list<array{disk: string, source_path: string, variants: array<string, array{path: string, max_edge: int}>, log_context?: string}> $items
     */
    public function __construct(
        public array $items,
        public int $jpegQuality = 82,
        public int $webpQuality = 80,
    ) {
        $this->afterCommit();
    }

    public function handle(): void
    {
        foreach ($this->items as $item) {
            $this->generateItem($item);
        }
    }

    /**
     * @param array{disk: string, source_path: string, variants: array<string, array{path: string, max_edge: int}>, log_context?: string} $item
     */
    private function generateItem(array $item): void
    {
        $disk = trim($item['disk']);
        $sourcePath = trim($item['source_path']);
        $variants = $item['variants'];
        $logContext = trim((string) ($item['log_context'] ?? 'Stored media'));

        if ($disk === '' || $sourcePath === '' || $variants === []) {
            return;
        }

        $storage = Storage::disk($disk);

        try {
            $contents = $storage->get($sourcePath);
            if (! is_string($contents) || $contents === '') {
                return;
            }

            foreach ($variants as $config) {
                $variantPath = trim((string) ($config['path'] ?? ''));
                $maxEdge = (int) ($config['max_edge'] ?? 0);

                if ($variantPath === '' || $maxEdge <= 0) {
                    continue;
                }

                $generatedVariant = ImageVariantGenerator::make(
                    $contents,
                    $sourcePath,
                    $maxEdge,
                    $this->jpegQuality,
                    $this->webpQuality,
                );

                if ($generatedVariant === null) {
                    continue;
                }

                $storage->put($variantPath, $generatedVariant['contents']);
                MediaPathCache::markPresent($disk, $variantPath);
            }
        } catch (\Throwable $exception) {
            Log::warning($logContext.' variant batch item generation failed.', [
                'exception' => $exception::class,
                'disk' => $disk,
                'source_path' => $sourcePath,
            ]);
        }
    }
}
