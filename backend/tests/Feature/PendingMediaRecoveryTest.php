<?php

namespace Tests\Feature;

use App\Jobs\ProcessUploadedMedia;
use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\PatientClinicalPhoto;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use App\Services\Media\PendingMediaRecoveryService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PendingMediaRecoveryTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_requeues_every_old_pending_media_type_but_skips_fresh_rows(): void
    {
        Queue::fake();
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $entry = OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);

        $patient->forceFill([
            'photo_disk' => 'local',
            'scan_status' => 'pending',
            'quarantine_path' => 'quarantine/patients/profile.jpg',
        ])->saveQuietly();
        $clinicalPhoto = PatientClinicalPhoto::query()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'view_type' => PatientClinicalPhoto::VIEW_TYPE_SMILE,
            'is_primary' => true,
            'sort_order' => 1,
            'disk' => 'local',
            'path' => 'quarantine/patients/clinical.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'pending',
            'quarantine_path' => 'quarantine/patients/clinical.jpg',
        ]);
        $treatmentImage = TreatmentImage::query()->create([
            'dentist_id' => $dentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => 'quarantine/treatments/image.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'pending',
            'quarantine_path' => 'quarantine/treatments/image.jpg',
        ]);
        $odontogramImage = OdontogramEntryImage::query()->create([
            'dentist_id' => $dentist->id,
            'odontogram_entry_id' => $entry->id,
            'stage' => 'before',
            'disk' => 'local',
            'path' => 'quarantine/odontogram/image.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'pending',
            'quarantine_path' => 'quarantine/odontogram/image.jpg',
        ]);

        foreach ([$patient, $clinicalPhoto, $treatmentImage, $odontogramImage] as $record) {
            $this->markOld($record);
        }

        $freshPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'scan_status' => 'pending',
            'quarantine_path' => 'quarantine/patients/fresh.jpg',
        ]);

        $result = app(PendingMediaRecoveryService::class)->recover(now()->subMinutes(5), 100);

        $this->assertSame(4, $result['queued']);
        $this->assertSame(0, $result['failed']);
        Queue::assertPushed(ProcessUploadedMedia::class, 4);
        Queue::assertNotPushed(ProcessUploadedMedia::class, fn (ProcessUploadedMedia $job): bool => $job->modelId === (string) $freshPatient->id);
        foreach ([$patient, $clinicalPhoto, $treatmentImage, $odontogramImage] as $record) {
            Queue::assertPushed(ProcessUploadedMedia::class, fn (ProcessUploadedMedia $job): bool => $job->modelClass === $record::class
                && $job->modelId === (string) $record->getKey()
                && $job->ownerId === (int) $dentist->id);
        }
    }

    private function markOld(Model $record): void
    {
        $record->forceFill(['updated_at' => now()->subMinutes(10)])->saveQuietly();
    }
}
