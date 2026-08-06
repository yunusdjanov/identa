<?php

namespace App\Services\Media;

use App\Jobs\ProcessUploadedMedia;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

class MediaQueueDispatcher
{
    public function __construct(
        private readonly Dispatcher $dispatcher,
    ) {}

    /**
     * Queue media processing without turning a temporary queue outage into a
     * failed upload response. PendingMediaRecoveryService will retry records
     * whose initial enqueue could not reach the broker.
     *
     * @param  class-string<Model>  $modelClass
     */
    public function dispatch(string $modelClass, string $modelId, int $ownerId): bool
    {
        try {
            $this->dispatcher->dispatch(new ProcessUploadedMedia($modelClass, $modelId, $ownerId));

            return true;
        } catch (\Throwable $exception) {
            Log::warning('Media processing enqueue failed; pending recovery will retry it.', [
                'exception' => $exception::class,
                'model' => $modelClass,
                'record_ref' => hash('sha256', $modelClass.':'.$modelId),
            ]);

            return false;
        }
    }
}
