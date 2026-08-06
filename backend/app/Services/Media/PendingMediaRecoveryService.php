<?php

namespace App\Services\Media;

use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\PatientClinicalPhoto;
use App\Models\TreatmentImage;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;

class PendingMediaRecoveryService
{
    /**
     * @var list<class-string<Model>>
     */
    private const MEDIA_MODELS = [
        Patient::class,
        PatientClinicalPhoto::class,
        TreatmentImage::class,
        OdontogramEntryImage::class,
    ];

    public function __construct(
        private readonly MediaQueueDispatcher $dispatcher,
    ) {}

    /**
     * @return array{queued: int, failed: int, models: array<class-string<Model>, array{queued: int, failed: int}>}
     */
    public function recover(CarbonInterface $updatedBefore, int $limitPerModel): array
    {
        $limitPerModel = max(1, min($limitPerModel, 1000));
        $result = [
            'queued' => 0,
            'failed' => 0,
            'models' => [],
        ];

        foreach (self::MEDIA_MODELS as $modelClass) {
            $modelResult = ['queued' => 0, 'failed' => 0];
            $records = $modelClass::query()
                ->where('scan_status', 'pending')
                ->whereNotNull('quarantine_path')
                ->where('quarantine_path', '!=', '')
                ->where('updated_at', '<=', $updatedBefore)
                ->oldest('updated_at')
                ->limit($limitPerModel)
                ->get(['id', 'dentist_id']);

            foreach ($records as $record) {
                $queued = $this->dispatcher->dispatch(
                    $modelClass,
                    (string) $record->getKey(),
                    (int) $record->getAttribute('dentist_id'),
                );
                $key = $queued ? 'queued' : 'failed';
                $modelResult[$key]++;
                $result[$key]++;

                // A broker outage affects every following record too. Stop
                // after the first failed enqueue and let the next recovery
                // pass retry, avoiding a burst of identical connection errors.
                if (! $queued) {
                    $result['models'][$modelClass] = $modelResult;

                    return $result;
                }
            }

            $result['models'][$modelClass] = $modelResult;
        }

        return $result;
    }
}
