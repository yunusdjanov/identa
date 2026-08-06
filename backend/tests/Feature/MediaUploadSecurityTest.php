<?php

namespace Tests\Feature;

use App\Jobs\ProcessUploadedMedia;
use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\PatientClinicalPhoto;
use App\Models\Plan;
use App\Models\Subscription;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use App\Services\ImageCompressionService;
use App\Services\Media\AntivirusScanner;
use App\Services\Media\ScanResult;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

class MediaUploadSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_media_tables_have_scan_lifecycle_columns(): void
    {
        foreach (['patients', 'treatment_images', 'odontogram_entry_images', 'patient_clinical_photos'] as $table) {
            $this->assertTrue(Schema::hasColumn($table, 'scan_status'), "{$table} is missing scan_status");
            $this->assertTrue(Schema::hasColumn($table, 'scan_result'), "{$table} is missing scan_result");
            $this->assertTrue(Schema::hasColumn($table, 'scan_provider'), "{$table} is missing scan_provider");
            $this->assertTrue(Schema::hasColumn($table, 'quarantine_path'), "{$table} is missing quarantine_path");
            $this->assertTrue(Schema::hasColumn($table, 'approved_at'), "{$table} is missing approved_at");
            $this->assertTrue(Schema::hasColumn($table, 'scanned_at'), "{$table} is missing scanned_at");
            $this->assertTrue(Schema::hasColumn($table, 'rejected_at'), "{$table} is missing rejected_at");
        }
        $this->assertTrue(Schema::hasColumn('treatment_images', 'upload_id'));
    }

    public function test_process_uploaded_media_rejects_infected_treatment_image(): void
    {
        Storage::fake('local');
        $this->app->bind(AntivirusScanner::class, fn () => new class implements AntivirusScanner {
            public function scanString(string $contents): ScanResult
            {
                return ScanResult::infected('test', 'Eicar-Test-Signature FOUND');
            }

            public function scanPath(string $path): ScanResult
            {
                return ScanResult::infected('test', 'Eicar-Test-Signature FOUND');
            }
        });

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $quarantinePath = 'quarantine/treatments/infected.jpg';
        $image = UploadedFile::fake()->image('infected.jpg', 800, 600);
        Storage::disk('local')->put($quarantinePath, file_get_contents((string) $image->getRealPath()));

        $record = TreatmentImage::query()->create([
            'dentist_id' => $dentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => $quarantinePath,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($quarantinePath),
            'scan_status' => 'pending',
            'quarantine_path' => $quarantinePath,
        ]);

        ProcessUploadedMedia::dispatchSync(TreatmentImage::class, (string) $record->id, $dentist->id);

        $record->refresh();
        $this->assertSame('rejected', $record->scan_status);
        $this->assertSame('Eicar-Test-Signature FOUND', $record->scan_result);
        $this->assertSame('test', $record->scan_provider);
        $this->assertNotNull($record->rejected_at);
        Storage::disk('local')->assertMissing($quarantinePath);
    }

    public function test_process_uploaded_media_does_not_approve_when_storage_write_returns_false(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $record = TreatmentImage::query()->create([
            'dentist_id' => $dentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => 'quarantine/treatments/write-failure.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'pending',
            'quarantine_path' => 'quarantine/treatments/write-failure.jpg',
        ]);

        $disk = \Mockery::mock();
        $disk->shouldReceive('exists')->once()->andReturnTrue();
        $disk->shouldReceive('get')->once()->andReturn('sanitized input');
        $disk->shouldReceive('put')->once()->andReturnFalse();
        Storage::shouldReceive('disk')->with('local')->andReturn($disk);
        $scanner = \Mockery::mock(AntivirusScanner::class);
        $scanner->shouldReceive('scanString')->once()->andReturn(ScanResult::clean('test'));
        $compression = \Mockery::mock(ImageCompressionService::class);
        $compression->shouldReceive('optimizeContents')->once()->andReturn([
            'contents' => 'approved bytes',
            'mime_type' => 'image/webp',
            'extension' => 'webp',
            'file_size' => 14,
        ]);

        try {
            (new ProcessUploadedMedia(TreatmentImage::class, (string) $record->id, (int) $dentist->id))
                ->handle($scanner, $compression);
            $this->fail('A failed approved-media write must throw for queue retry.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Unable to persist approved media.', $exception->getMessage());
        }

        $record->refresh();
        $this->assertSame('pending', $record->scan_status);
        $this->assertSame('quarantine/treatments/write-failure.jpg', $record->quarantine_path);
        $this->assertNull($record->approved_at);
    }

    public function test_process_uploaded_media_approves_clean_patient_photo(): void
    {
        Storage::fake('local');
        $this->app->bind(AntivirusScanner::class, fn () => new class implements AntivirusScanner {
            public function scanString(string $contents): ScanResult
            {
                return ScanResult::clean('test', 'stream: OK');
            }

            public function scanPath(string $path): ScanResult
            {
                return ScanResult::clean('test', 'stream: OK');
            }
        });

        $dentist = User::factory()->create();
        $quarantinePath = 'quarantine/patients/clean-photo.jpg';
        $image = UploadedFile::fake()->image('clean-photo.jpg', 800, 600);
        Storage::disk('local')->put($quarantinePath, file_get_contents((string) $image->getRealPath()));
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'photo_disk' => 'local',
            'photo_path' => $quarantinePath,
            'scan_status' => 'pending',
            'quarantine_path' => $quarantinePath,
        ]);

        ProcessUploadedMedia::dispatchSync(Patient::class, (string) $patient->id, $dentist->id);

        $patient->refresh();
        $this->assertSame('approved', $patient->scan_status);
        $this->assertSame('test', $patient->scan_provider);
        $this->assertSame('stream: OK', $patient->scan_result);
        $this->assertNotNull($patient->approved_at);
        $this->assertIsString($patient->photo_path);
        $this->assertStringStartsWith('approved/', $patient->photo_path);
        Storage::disk('local')->assertMissing($quarantinePath);
        Storage::disk('local')->assertExists((string) $patient->photo_path);
    }

    public function test_process_uploaded_media_keeps_operational_failure_pending_for_recovery(): void
    {
        Storage::fake('local');
        $this->bindCleanScanner();
        $this->app->bind(ImageCompressionService::class, fn () => new class extends ImageCompressionService {
            public function optimizeContents(
                string $contents,
                ?string $fallbackMimeType,
                ?int $targetMaxBytes
            ): ?array {
                throw new RuntimeException('Temporary encoder outage.');
            }
        });

        $dentist = User::factory()->create();
        $quarantinePath = 'quarantine/patients/retry-photo.jpg';
        $image = UploadedFile::fake()->image('retry-photo.jpg', 800, 600);
        Storage::disk('local')->put($quarantinePath, file_get_contents((string) $image->getRealPath()));
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'photo_disk' => 'local',
            'photo_path' => $quarantinePath,
            'scan_status' => 'pending',
            'quarantine_path' => $quarantinePath,
        ]);
        $job = new ProcessUploadedMedia(Patient::class, (string) $patient->id, $dentist->id);

        try {
            $this->app->call([$job, 'handle']);
            $this->fail('The operational media failure was not rethrown for retry.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Temporary encoder outage.', $exception->getMessage());
        }

        $patient->refresh();
        $this->assertSame('pending', $patient->scan_status);
        $this->assertSame($quarantinePath, $patient->quarantine_path);
        Storage::disk('local')->assertExists($quarantinePath);

        $job->failed(new RuntimeException('Retries exhausted.'));

        $patient->refresh();
        $this->assertSame('pending', $patient->scan_status);
        $this->assertSame('internal', $patient->scan_provider);
        $this->assertSame($quarantinePath, $patient->quarantine_path);
        $this->assertNull($patient->rejected_at);
        Storage::disk('local')->assertExists($quarantinePath);
    }

    public function test_process_uploaded_media_approves_clean_patient_oral_photo(): void
    {
        Storage::fake('local');
        $this->bindCleanScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $quarantinePath = 'quarantine/patients/oral-clean-photo.jpg';
        $image = UploadedFile::fake()->image('oral-clean-photo.jpg', 1800, 1200);
        Storage::disk('local')->put($quarantinePath, file_get_contents((string) $image->getRealPath()));

        $photo = PatientClinicalPhoto::query()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'view_type' => PatientClinicalPhoto::VIEW_TYPE_SMILE,
            'is_primary' => true,
            'disk' => 'local',
            'path' => $quarantinePath,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($quarantinePath),
            'scan_status' => 'pending',
            'quarantine_path' => $quarantinePath,
        ]);

        ProcessUploadedMedia::dispatchSync(PatientClinicalPhoto::class, (string) $photo->id, $dentist->id);

        $photo->refresh();
        $this->assertSame('approved', $photo->scan_status);
        $this->assertSame('test', $photo->scan_provider);
        $this->assertStringStartsWith('approved/patients/', (string) $photo->path);
        Storage::disk('local')->assertMissing($quarantinePath);
        Storage::disk('local')->assertExists((string) $photo->path);
        Storage::disk('local')->assertExists($this->variantPath((string) $photo->path, 'thumbnail'));
        Storage::disk('local')->assertExists($this->variantPath((string) $photo->path, 'preview'));
    }

    public function test_rejected_patient_photo_replacement_retains_previous_photo(): void
    {
        Storage::fake('local');
        $this->bindInfectedScanner();

        $dentist = User::factory()->create();
        $previousPath = 'approved/patients/previous-photo.jpg';
        $quarantinePath = 'quarantine/patients/replacement-photo.jpg';
        $previousPhoto = UploadedFile::fake()->image('previous-photo.jpg', 800, 600);
        $replacementPhoto = UploadedFile::fake()->image('replacement-photo.jpg', 800, 600);
        Storage::disk('local')->put($previousPath, file_get_contents((string) $previousPhoto->getRealPath()));
        Storage::disk('local')->put($quarantinePath, file_get_contents((string) $replacementPhoto->getRealPath()));

        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'photo_disk' => 'local',
            'photo_path' => $previousPath,
            'scan_status' => 'pending',
            'quarantine_path' => $quarantinePath,
            'approved_at' => now(),
        ]);

        ProcessUploadedMedia::dispatchSync(Patient::class, (string) $patient->id, $dentist->id);

        $patient->refresh();
        $this->assertSame('approved', $patient->scan_status);
        $this->assertSame($previousPath, $patient->photo_path);
        $this->assertNull($patient->quarantine_path);
        $this->assertNotNull($patient->rejected_at);
        $this->assertSame('test', $patient->scan_provider);
        Storage::disk('local')->assertExists($previousPath);
        Storage::disk('local')->assertMissing($quarantinePath);
    }

    public function test_clean_patient_photo_replacement_generates_variants_and_deletes_previous_photo(): void
    {
        Storage::fake('local');
        $this->bindCleanScanner();

        $dentist = User::factory()->create();
        $previousPath = 'approved/patients/previous-clean-photo.jpg';
        $quarantinePath = 'quarantine/patients/replacement-clean-photo.jpg';
        $previousPhoto = UploadedFile::fake()->image('previous-clean-photo.jpg', 800, 600);
        $replacementPhoto = UploadedFile::fake()->image('replacement-clean-photo.jpg', 1200, 900);
        Storage::disk('local')->put($previousPath, file_get_contents((string) $previousPhoto->getRealPath()));
        Storage::disk('local')->put($quarantinePath, file_get_contents((string) $replacementPhoto->getRealPath()));

        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'photo_disk' => 'local',
            'photo_path' => $previousPath,
            'scan_status' => 'pending',
            'quarantine_path' => $quarantinePath,
            'approved_at' => now(),
        ]);

        ProcessUploadedMedia::dispatchSync(Patient::class, (string) $patient->id, $dentist->id);

        $patient->refresh();
        $newPath = (string) $patient->photo_path;
        $this->assertSame('approved', $patient->scan_status);
        $this->assertNotSame($previousPath, $newPath);
        $this->assertStringStartsWith('approved/patients/', $newPath);
        Storage::disk('local')->assertExists($newPath);
        Storage::disk('local')->assertExists($this->variantPath($newPath, 'thumbnail'));
        Storage::disk('local')->assertExists($this->variantPath($newPath, 'preview'));
        Storage::disk('local')->assertMissing($previousPath);
        Storage::disk('local')->assertMissing($quarantinePath);
    }

    public function test_rejected_odontogram_image_replacement_retains_previous_image(): void
    {
        Storage::fake('local');
        $this->bindInfectedScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $entry = OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $previousPath = 'approved/odontogram/previous-before.jpg';
        $quarantinePath = 'quarantine/odontogram/replacement-before.jpg';
        $previousImage = UploadedFile::fake()->image('previous-before.jpg', 800, 600);
        $replacementImage = UploadedFile::fake()->image('replacement-before.jpg', 800, 600);
        Storage::disk('local')->put($previousPath, file_get_contents((string) $previousImage->getRealPath()));
        Storage::disk('local')->put($quarantinePath, file_get_contents((string) $replacementImage->getRealPath()));

        $image = OdontogramEntryImage::query()->create([
            'dentist_id' => $dentist->id,
            'odontogram_entry_id' => $entry->id,
            'stage' => 'before',
            'disk' => 'local',
            'path' => $previousPath,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($previousPath),
            'scan_status' => 'pending',
            'quarantine_path' => $quarantinePath,
            'approved_at' => now(),
        ]);

        ProcessUploadedMedia::dispatchSync(OdontogramEntryImage::class, (string) $image->id, $dentist->id);

        $image->refresh();
        $this->assertSame('approved', $image->scan_status);
        $this->assertSame($previousPath, $image->path);
        $this->assertNull($image->quarantine_path);
        Storage::disk('local')->assertExists($previousPath);
        Storage::disk('local')->assertMissing($quarantinePath);
    }

    public function test_pending_treatment_image_cannot_be_downloaded(): void
    {
        Storage::fake('local');
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $quarantinePath = 'quarantine/treatments/pending.jpg';
        $image = UploadedFile::fake()->image('pending.jpg', 800, 600);
        Storage::disk('local')->put($quarantinePath, file_get_contents((string) $image->getRealPath()));

        $record = TreatmentImage::query()->create([
            'dentist_id' => $dentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => $quarantinePath,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($quarantinePath),
            'scan_status' => 'pending',
            'quarantine_path' => $quarantinePath,
        ]);

        $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/{$record->id}")
            ->assertNotFound();
    }

    public function test_pending_patient_photo_cannot_be_downloaded(): void
    {
        Storage::fake('local');
        $dentist = User::factory()->create();
        $photoPath = 'quarantine/patients/pending-photo.jpg';
        $image = UploadedFile::fake()->image('pending-photo.jpg', 800, 600);
        Storage::disk('local')->put($photoPath, file_get_contents((string) $image->getRealPath()));
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'photo_disk' => 'local',
            'photo_path' => $photoPath,
            'scan_status' => 'pending',
            'quarantine_path' => $photoPath,
        ]);

        $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/photo")
            ->assertNotFound();
    }

    public function test_pending_patient_oral_photo_cannot_be_downloaded(): void
    {
        Storage::fake('local');
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $photoPath = 'quarantine/patients/pending-oral-photo.jpg';
        $image = UploadedFile::fake()->image('pending-oral-photo.jpg', 800, 600);
        Storage::disk('local')->put($photoPath, file_get_contents((string) $image->getRealPath()));
        PatientClinicalPhoto::query()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'view_type' => PatientClinicalPhoto::VIEW_TYPE_SMILE,
            'is_primary' => true,
            'disk' => 'local',
            'path' => $photoPath,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($photoPath),
            'scan_status' => 'pending',
            'quarantine_path' => $photoPath,
        ]);

        $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/oral-photo")
            ->assertNotFound();
    }

    public function test_patient_response_includes_photo_scan_status(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'scan_status' => 'pending',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}")
            ->assertOk()
            ->assertJsonPath('data.photo_scan_status', 'pending')
            ->assertJsonPath('data.photo_processing_status', 'pending');
    }

    public function test_infected_patient_photo_upload_is_rejected(): void
    {
        Storage::fake('local');
        $this->app->bind(AntivirusScanner::class, fn () => new class implements AntivirusScanner {
            public function scanString(string $contents): ScanResult
            {
                return ScanResult::infected('test', 'Eicar-Test-Signature FOUND');
            }

            public function scanPath(string $path): ScanResult
            {
                return ScanResult::infected('test', 'Eicar-Test-Signature FOUND');
            }
        });

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/photo", [
                'photo' => UploadedFile::fake()->image('infected.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['photo']);

        $patient->refresh();
        $this->assertSame('rejected', $patient->scan_status);
        $this->assertSame('Eicar-Test-Signature FOUND', $patient->scan_result);
        $this->assertNull($patient->photo_path);
        $this->assertFalse(collect(Storage::disk('local')->allFiles())->contains(
            fn (string $path): bool => str_starts_with($path, 'quarantine/')
        ));
    }

    public function test_infected_patient_oral_photo_upload_cleans_rejected_record(): void
    {
        Storage::fake('local');
        $this->bindInfectedScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/oral-photos/top", [
                'photo' => UploadedFile::fake()->image('infected-oral.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['photo']);

        $this->assertDatabaseCount('patient_clinical_photos', 0);
        $this->assertFalse(collect(Storage::disk('local')->allFiles())->contains(
            fn (string $path): bool => str_starts_with($path, 'quarantine/')
        ));
    }

    public function test_infected_treatment_image_upload_is_rejected(): void
    {
        Storage::fake('local');
        $this->app->bind(AntivirusScanner::class, fn () => new class implements AntivirusScanner {
            public function scanString(string $contents): ScanResult
            {
                return ScanResult::infected('test', 'Eicar-Test-Signature FOUND');
            }

            public function scanPath(string $path): ScanResult
            {
                return ScanResult::infected('test', 'Eicar-Test-Signature FOUND');
            }
        });

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images", [
                'image' => UploadedFile::fake()->image('infected.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['image']);

        $this->assertDatabaseHas('treatment_images', [
            'treatment_id' => $treatment->id,
            'scan_status' => 'rejected',
        ]);
        $this->assertFalse(collect(Storage::disk('local')->allFiles())->contains(
            fn (string $path): bool => str_starts_with($path, 'quarantine/')
        ));
    }

    public function test_treatment_upload_returns_pending_when_processing_is_queued(): void
    {
        Queue::fake();
        Storage::fake('local');

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images", [
                'image' => UploadedFile::fake()->image('queued.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.images.0.scan_status', 'pending')
            ->assertJsonPath('data.images.0.url', null);

        Queue::assertPushed(ProcessUploadedMedia::class);
    }

    public function test_treatment_upload_remains_saved_when_queue_broker_is_temporarily_unavailable(): void
    {
        Storage::fake('local');
        $bus = \Mockery::mock(Dispatcher::class);
        $bus->shouldReceive('dispatch')
            ->once()
            ->andThrow(new RuntimeException('broker unavailable'));
        $this->app->instance(Dispatcher::class, $bus);

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images", [
                'image' => UploadedFile::fake()->image('queue-outage.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.images.0.scan_status', 'pending')
            ->assertJsonPath('data.images.0.url', null);

        $record = TreatmentImage::query()->sole();
        $this->assertSame('pending', $record->scan_status);
        $this->assertNotNull($record->quarantine_path);
        Storage::disk('local')->assertExists((string) $record->quarantine_path);
    }

    public function test_pending_treatment_media_response_has_scan_status_and_no_urls(): void
    {
        Storage::fake('local');
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        TreatmentImage::query()->create([
            'dentist_id' => $dentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => 'quarantine/treatments/pending-response.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'pending',
            'quarantine_path' => 'quarantine/treatments/pending-response.jpg',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}")
            ->assertOk()
            ->assertJsonPath('data.images.0.scan_status', 'pending')
            ->assertJsonPath('data.images.0.url', null)
            ->assertJsonPath('data.images.0.thumbnail_url', null)
            ->assertJsonPath('data.images.0.preview_url', null);

    }

    public function test_rejected_treatment_images_are_hidden_from_treatment_response(): void
    {
        $dentist = User::factory()->create();
        $dentist->activatePaidSubscription(User::SUBSCRIPTION_PLAN_YEARLY);
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);

        TreatmentImage::query()->create([
            'dentist_id' => $dentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => 'approved/treatments/rejected.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'rejected',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}")
            ->assertOk()
            ->assertJsonPath('data.image_count', 0)
            ->assertJsonPath('data.primary_image', null)
            ->assertJsonPath('data.images', []);
    }

    public function test_infected_patient_photo_direct_upload_is_rejected(): void
    {
        Storage::fake('local');
        $this->bindInfectedScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $uploadId = 'patient-photo-direct-infected';
        $path = 'quarantine/patients/direct-infected.jpg';
        $image = UploadedFile::fake()->image('direct-infected.jpg', 800, 600);
        Storage::disk('local')->put($path, file_get_contents((string) $image->getRealPath()));
        Cache::put("patient-photo-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($path),
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/photo/direct-upload/{$uploadId}/complete")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['photo']);

        $patient->refresh();
        $this->assertSame('rejected', $patient->scan_status);
        $this->assertSame('Eicar-Test-Signature FOUND', $patient->scan_result);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_clean_patient_photo_direct_upload_is_approved_from_quarantine(): void
    {
        Storage::fake('local');
        $this->bindCleanScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $uploadId = 'patient-photo-direct-clean';
        $path = 'quarantine/patients/direct-clean.jpg';
        $image = UploadedFile::fake()->image('direct-clean.jpg', 800, 600);
        Storage::disk('local')->put($path, file_get_contents((string) $image->getRealPath()));
        Cache::put("patient-photo-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($path),
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/photo/direct-upload/{$uploadId}/complete")
            ->assertOk()
            ->assertJsonPath('data.photo_scan_status', 'approved');

        $patient->refresh();
        $this->assertSame('approved', $patient->scan_status);
        $this->assertIsString($patient->photo_path);
        $this->assertStringStartsWith('approved/patients/', $patient->photo_path);
        Storage::disk('local')->assertMissing($path);
        Storage::disk('local')->assertExists((string) $patient->photo_path);
    }

    public function test_infected_patient_oral_photo_direct_upload_cleans_rejected_record(): void
    {
        Storage::fake('local');
        $this->bindInfectedScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $uploadId = 'patient-oral-photo-direct-infected';
        $path = 'quarantine/patients/direct-infected-oral.jpg';
        $image = UploadedFile::fake()->image('direct-infected-oral.jpg', 800, 600);
        Storage::disk('local')->put($path, file_get_contents((string) $image->getRealPath()));
        Cache::put("patient-oral-photo-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'view_type' => PatientClinicalPhoto::VIEW_TYPE_BOTTOM,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($path),
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/oral-photos/bottom/direct-upload/{$uploadId}/complete")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['photo']);

        $this->assertDatabaseCount('patient_clinical_photos', 0);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_infected_treatment_image_direct_upload_is_rejected(): void
    {
        Storage::fake('local');
        $this->bindInfectedScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $uploadId = 'treatment-direct-infected';
        $path = 'quarantine/treatments/direct-infected.jpg';
        $image = UploadedFile::fake()->image('direct-infected.jpg', 800, 600);
        Storage::disk('local')->put($path, file_get_contents((string) $image->getRealPath()));
        Cache::put("treatment-image-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'treatment_id' => (string) $treatment->id,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($path),
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/direct-upload/{$uploadId}/complete")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['image']);

        $this->assertDatabaseHas('treatment_images', [
            'treatment_id' => $treatment->id,
            'scan_status' => 'rejected',
        ]);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_infected_treatment_image_batch_direct_upload_is_rejected(): void
    {
        Storage::fake('local');
        $this->bindInfectedScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $uploadId = '11111111-1111-4111-8111-111111111111';
        $path = 'quarantine/treatments/batch-direct-infected.jpg';
        $image = UploadedFile::fake()->image('batch-direct-infected.jpg', 800, 600);
        Storage::disk('local')->put($path, file_get_contents((string) $image->getRealPath()));
        Cache::put("treatment-image-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'treatment_id' => (string) $treatment->id,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($path),
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/direct-upload-batch/complete", [
                'upload_ids' => [$uploadId],
            ])
            ->assertStatus(207)
            ->assertJsonPath('data.completed_count', 0)
            ->assertJsonPath('data.failed.0.reason', 'security');

        $this->assertDatabaseHas('treatment_images', [
            'treatment_id' => $treatment->id,
            'scan_status' => 'rejected',
        ]);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_treatment_image_batch_finalize_rejects_duplicate_upload_ids(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $uploadId = '22222222-2222-4222-8222-222222222222';

        $this->actingAs($dentist, 'web')
            ->postJson(
                "/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/direct-upload-batch/complete",
                ['upload_ids' => [$uploadId, $uploadId]]
            )
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['upload_ids.1']);
    }

    public function test_treatment_image_batch_finalize_is_idempotent_after_a_lost_response(): void
    {
        Storage::fake('local');
        $this->bindCleanScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $uploadId = '33333333-3333-4333-8333-333333333333';
        $path = 'quarantine/treatments/batch-idempotent.jpg';
        $image = UploadedFile::fake()->image('batch-idempotent.jpg', 800, 600);
        Storage::disk('local')->put($path, file_get_contents((string) $image->getRealPath()));
        Cache::put("treatment-image-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'treatment_id' => (string) $treatment->id,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($path),
        ]);

        $url = "/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/direct-upload-batch/complete";
        $payload = ['upload_ids' => [$uploadId]];

        $this->actingAs($dentist, 'web')
            ->postJson($url, $payload)
            ->assertCreated()
            ->assertJsonPath('data.completed_count', 1);

        $this->actingAs($dentist, 'web')
            ->postJson($url, $payload)
            ->assertCreated()
            ->assertJsonPath('data.completed_count', 1);

        $this->assertDatabaseCount('treatment_images', 1);
        $this->assertDatabaseHas('treatment_images', [
            'treatment_id' => (string) $treatment->id,
            'upload_id' => $uploadId,
        ]);
    }

    public function test_patient_photo_direct_upload_enforces_actual_stored_size(): void
    {
        Storage::fake('local');

        $dentist = $this->createDentistWithTinyUploadLimit();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $uploadId = 'patient-photo-underreported-size';
        $path = 'quarantine/patients/underreported-profile.jpg';
        Storage::disk('local')->put($path, str_repeat('x', 20_000));
        Cache::put("patient-photo-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => 1,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/photo/direct-upload/{$uploadId}/complete")
            ->assertForbidden()
            ->assertJsonPath('error.code', 'plan_upload_size_exceeded');

        Storage::disk('local')->assertMissing($path);
        $patient->refresh();
        $this->assertNull($patient->photo_path);
    }

    public function test_patient_oral_photo_direct_upload_enforces_actual_stored_size(): void
    {
        Storage::fake('local');

        $dentist = $this->createDentistWithTinyUploadLimit();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $uploadId = 'patient-oral-photo-underreported-size';
        $path = 'quarantine/patients/underreported-oral.jpg';
        Storage::disk('local')->put($path, str_repeat('x', 20_000));
        Cache::put("patient-oral-photo-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'view_type' => PatientClinicalPhoto::VIEW_TYPE_SMILE,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => 1,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/oral-photos/smile/direct-upload/{$uploadId}/complete")
            ->assertForbidden()
            ->assertJsonPath('error.code', 'plan_upload_size_exceeded');

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseCount('patient_clinical_photos', 0);
    }

    public function test_patient_oral_photo_direct_upload_cleans_object_when_slot_limit_is_reached_late(): void
    {
        Storage::fake('local');

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        foreach (range(1, 10) as $sortOrder) {
            PatientClinicalPhoto::query()->create([
                'dentist_id' => $dentist->id,
                'patient_id' => $patient->id,
                'view_type' => PatientClinicalPhoto::VIEW_TYPE_TOP,
                'is_primary' => $sortOrder === 1,
                'sort_order' => $sortOrder,
                'disk' => 'local',
                'path' => "approved/patients/oral-{$sortOrder}.jpg",
                'mime_type' => 'image/jpeg',
                'file_size' => 123,
                'scan_status' => 'approved',
            ]);
        }

        $uploadId = 'patient-oral-photo-limit-late';
        $path = 'quarantine/patients/oral-limit-late.jpg';
        Storage::disk('local')->put($path, str_repeat('x', 1_000));
        Cache::put("patient-oral-photo-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'view_type' => PatientClinicalPhoto::VIEW_TYPE_TOP,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => 1_000,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/oral-photos/top/direct-upload/{$uploadId}/complete")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['photo']);

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseCount('patient_clinical_photos', 10);
    }

    public function test_rejected_oral_photo_replacement_retains_previous_approved_photo(): void
    {
        Storage::fake('local');
        $this->bindInfectedScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $approvedPath = 'approved/patients/oral-bottom-original.jpg';
        Storage::disk('local')->put($approvedPath, 'original');
        $photo = PatientClinicalPhoto::query()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'view_type' => PatientClinicalPhoto::VIEW_TYPE_BOTTOM,
            'is_primary' => true,
            'sort_order' => 1,
            'disk' => 'local',
            'path' => $approvedPath,
            'mime_type' => 'image/jpeg',
            'file_size' => 8,
            'scan_status' => 'approved',
            'approved_at' => now(),
        ]);

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/oral-photos/bottom/{$photo->id}/replace", [
                'photo' => UploadedFile::fake()->image('infected-edit.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['photo']);

        Storage::disk('local')->assertExists($approvedPath);
        $this->assertDatabaseHas('patient_clinical_photos', [
            'id' => (string) $photo->id,
            'path' => $approvedPath,
            'scan_status' => 'approved',
            'quarantine_path' => null,
        ]);
        $this->assertNotNull($photo->fresh()?->rejected_at);
    }

    public function test_treatment_direct_upload_enforces_actual_stored_size(): void
    {
        Storage::fake('local');

        $dentist = $this->createDentistWithTinyUploadLimit();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $uploadId = 'treatment-underreported-size';
        $path = 'quarantine/treatments/underreported.jpg';
        Storage::disk('local')->put($path, str_repeat('x', 20_000));
        Cache::put("treatment-image-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'treatment_id' => (string) $treatment->id,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => 1,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/direct-upload/{$uploadId}/complete")
            ->assertForbidden()
            ->assertJsonPath('error.code', 'plan_upload_size_exceeded');

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseCount('treatment_images', 0);
    }

    public function test_treatment_direct_upload_cleans_object_when_image_limit_is_reached_late(): void
    {
        Storage::fake('local');

        $dentist = $this->createDentistWithEntryImageLimit(1);
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        TreatmentImage::query()->create([
            'dentist_id' => $dentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => 'approved/treatments/existing.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'approved',
        ]);

        $uploadId = 'treatment-limit-late';
        $path = 'quarantine/treatments/limit-late.jpg';
        Storage::disk('local')->put($path, str_repeat('x', 1_000));
        Cache::put("treatment-image-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'treatment_id' => (string) $treatment->id,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => 1_000,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/direct-upload/{$uploadId}/complete")
            ->assertForbidden()
            ->assertJsonPath('error.code', 'plan_entry_image_limit_reached');

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseCount('treatment_images', 1);
    }

    public function test_rejected_treatment_image_replacement_retains_previous_approved_image(): void
    {
        Storage::fake('local');
        $this->bindInfectedScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $approvedPath = 'approved/treatments/original.jpg';
        Storage::disk('local')->put($approvedPath, 'original');
        $image = TreatmentImage::query()->create([
            'dentist_id' => $dentist->id,
            'treatment_id' => $treatment->id,
            'disk' => 'local',
            'path' => $approvedPath,
            'mime_type' => 'image/jpeg',
            'file_size' => 8,
            'scan_status' => 'approved',
            'approved_at' => now(),
        ]);

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/{$image->id}/replace", [
                'image' => UploadedFile::fake()->image('infected-edit.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['image']);

        Storage::disk('local')->assertExists($approvedPath);
        $this->assertDatabaseHas('treatment_images', [
            'id' => (string) $image->id,
            'path' => $approvedPath,
            'scan_status' => 'approved',
            'quarantine_path' => null,
        ]);
        $this->assertNotNull($image->fresh()?->rejected_at);
    }

    public function test_treatment_batch_direct_upload_enforces_actual_stored_size(): void
    {
        Storage::fake('local');

        $dentist = $this->createDentistWithTinyUploadLimit();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $uploadId = '22222222-2222-4222-8222-222222222222';
        $path = 'quarantine/treatments/batch-underreported.jpg';
        Storage::disk('local')->put($path, str_repeat('x', 20_000));
        Cache::put("treatment-image-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'treatment_id' => (string) $treatment->id,
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => 1,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/direct-upload-batch/complete", [
                'upload_ids' => [$uploadId],
            ])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'plan_upload_size_exceeded');

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseCount('treatment_images', 0);
    }

    private function variantPath(string $path, string $variant): string
    {
        $directory = pathinfo($path, PATHINFO_DIRNAME);
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = pathinfo($path, PATHINFO_EXTENSION) ?: 'jpg';

        return sprintf('%s/variants/%s-%s.%s', $directory, $filename, $variant, $extension);
    }

    private function createDentistWithTinyUploadLimit(): User
    {
        $dentist = User::factory()->create();
        $plan = Plan::query()->forceCreate([
            'code' => 'tiny-upload-'.$dentist->id,
            'name' => 'Tiny upload test plan',
            'description' => null,
            'is_trial' => false,
            'is_paid' => true,
            'trial_days' => null,
            'monthly_price' => 0,
            'yearly_price' => null,
            'currency' => 'UZS',
            'staff_limit' => 1,
            'entry_image_limit' => 10,
            'upload_max_mb' => 0.01,
            'stored_image_max_mb' => 1,
            'can_export' => false,
            'is_active' => true,
            'sort_order' => 999,
        ]);

        $dentist->subscriptions()->create([
            'plan_id' => $plan->id,
            'plan_code' => $plan->code,
            'plan_name' => $plan->name,
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'status' => Subscription::STATUS_ACTIVE,
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
            'cancel_at_period_end' => false,
        ]);

        return $dentist->refresh();
    }

    private function createDentistWithEntryImageLimit(int $entryImageLimit): User
    {
        $dentist = User::factory()->create();
        $plan = Plan::query()->forceCreate([
            'code' => 'entry-image-limit-'.$dentist->id,
            'name' => 'Entry image limit test plan',
            'description' => null,
            'is_trial' => false,
            'is_paid' => true,
            'trial_days' => null,
            'monthly_price' => 0,
            'yearly_price' => null,
            'currency' => 'UZS',
            'staff_limit' => 1,
            'entry_image_limit' => $entryImageLimit,
            'upload_max_mb' => 5,
            'stored_image_max_mb' => 5,
            'can_export' => false,
            'is_active' => true,
            'sort_order' => 999,
        ]);

        $dentist->subscriptions()->create([
            'plan_id' => $plan->id,
            'plan_code' => $plan->code,
            'plan_name' => $plan->name,
            'billing_period' => Subscription::PERIOD_MONTHLY,
            'status' => Subscription::STATUS_ACTIVE,
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
            'cancel_at_period_end' => false,
        ]);

        return $dentist->refresh();
    }

    private function bindInfectedScanner(): void
    {
        $this->app->bind(AntivirusScanner::class, fn () => new class implements AntivirusScanner {
            public function scanString(string $contents): ScanResult
            {
                return ScanResult::infected('test', 'Eicar-Test-Signature FOUND');
            }

            public function scanPath(string $path): ScanResult
            {
                return ScanResult::infected('test', 'Eicar-Test-Signature FOUND');
            }
        });
    }

    private function bindCleanScanner(): void
    {
        $this->app->bind(AntivirusScanner::class, fn () => new class implements AntivirusScanner {
            public function scanString(string $contents): ScanResult
            {
                return ScanResult::clean('test', 'stream: OK');
            }

            public function scanPath(string $path): ScanResult
            {
                return ScanResult::clean('test', 'stream: OK');
            }
        });
    }
}
