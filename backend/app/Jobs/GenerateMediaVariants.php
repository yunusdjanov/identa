<?php

namespace App\Jobs;

use App\Support\ImageVariantGenerator;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class GenerateMediaVariants implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $timeout = 180;

    /**
     * @param array<string, array{path: string, max_edge: int}> $variants
     */
    public function __construct(
        public string $disk,
        public string $sourcePath,
        public array $variants,
        public string $logContext = 'Stored media',
        public int $jpegQuality = 82,
        public int $webpQuality = 80,
    ) {
        $this->afterCommit();
    }

    public function handle(): void
    {
        $disk = trim($this->disk);
        $sourcePath = trim($this->sourcePath);
        if ($disk === '' || $sourcePath === '' || $this->variants === []) {
            return;
        }

        $storage = Storage::disk($disk);
        if (! $storage->exists($sourcePath)) {
            return;
        }

        try {
            $contents = $storage->get($sourcePath);

            foreach ($this->variants as $variant => $config) {
                $variantPath = trim((string) ($config['path'] ?? ''));
                $maxEdge = (int) ($config['max_edge'] ?? 0);

                if ($variantPath === '' || $maxEdge <= 0 || $storage->exists($variantPath)) {
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
            }
        } catch (\Throwable $exception) {
            Log::warning($this->logContext.' variant generation failed.', [
                'exception' => $exception::class,
                'disk' => $disk,
                'source_path' => $sourcePath,
            ]);
        }
    }
}
