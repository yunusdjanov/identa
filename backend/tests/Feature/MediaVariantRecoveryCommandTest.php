<?php

namespace Tests\Feature;

use App\Jobs\GenerateMediaVariants;
use App\Models\Patient;
use App\Models\PatientClinicalPhoto;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaVariantRecoveryCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_variant_recovery_covers_every_active_approved_media_type_and_skips_pending_objects(): void
    {
        Storage::fake('local');
        Queue::fake();
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'photo_disk' => 'local',
            'photo_path' => 'approved/patients/profile.jpg',
            'scan_status' => 'approved',
        ]);
        Storage::disk('local')->put((string) $patient->photo_path, 'approved profile');

        $clinicalPhoto = PatientClinicalPhoto::query()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'view_type' => PatientClinicalPhoto::VIEW_TYPE_SMILE,
            'is_primary' => true,
            'disk' => 'local',
            'path' => 'approved/patients/clinical.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 16,
            'scan_status' => 'approved',
        ]);
        Storage::disk('local')->put((string) $clinicalPhoto->path, 'approved clinical');

        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $treatmentImage = TreatmentImage::query()->create([
            'dentist_id' => $dentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => 'approved/treatments/image.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 18,
            'scan_status' => 'approved',
        ]);
        Storage::disk('local')->put((string) $treatmentImage->path, 'approved treatment');

        $pendingPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'photo_disk' => 'local',
            'photo_path' => 'quarantine/patients/pending.jpg',
            'scan_status' => 'pending',
            'quarantine_path' => 'quarantine/patients/pending.jpg',
        ]);
        Storage::disk('local')->put((string) $pendingPatient->photo_path, 'pending object');
        $pendingClinicalPhoto = PatientClinicalPhoto::query()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'view_type' => PatientClinicalPhoto::VIEW_TYPE_TOP,
            'is_primary' => true,
            'disk' => 'local',
            'path' => 'quarantine/patients/pending-clinical.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 16,
            'scan_status' => 'pending',
            'quarantine_path' => 'quarantine/patients/pending-clinical.jpg',
        ]);
        Storage::disk('local')->put((string) $pendingClinicalPhoto->path, 'pending clinical');
        $pendingTreatmentImage = TreatmentImage::query()->create([
            'dentist_id' => $dentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => 'quarantine/treatments/pending.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 17,
            'scan_status' => 'pending',
            'quarantine_path' => 'quarantine/treatments/pending.jpg',
        ]);
        Storage::disk('local')->put((string) $pendingTreatmentImage->path, 'pending treatment');

        $this->artisan('media:queue-variants', ['--force' => true])
            ->expectsOutput('Queued 1 patient photo job(s), 1 clinical photo job(s), and 1 treatment image job(s).')
            ->assertExitCode(0);

        Queue::assertPushed(GenerateMediaVariants::class, 3);
        foreach ([$patient->photo_path, $clinicalPhoto->path, $treatmentImage->path] as $sourcePath) {
            Queue::assertPushed(
                GenerateMediaVariants::class,
                fn (GenerateMediaVariants $job): bool => $job->sourcePath === $sourcePath
            );
        }
        foreach ([$pendingPatient->photo_path, $pendingClinicalPhoto->path, $pendingTreatmentImage->path] as $sourcePath) {
            Queue::assertNotPushed(
                GenerateMediaVariants::class,
                fn (GenerateMediaVariants $job): bool => $job->sourcePath === $sourcePath
            );
        }
    }
}
