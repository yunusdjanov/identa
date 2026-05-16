<?php

namespace Tests\Feature;

use App\Jobs\ProcessUploadedMedia;
use App\Models\OdontogramEntry;
use App\Models\OdontogramEntryImage;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use App\Services\Media\AntivirusScanner;
use App\Services\Media\ScanResult;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaUploadSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_media_tables_have_scan_lifecycle_columns(): void
    {
        foreach (['patients', 'treatment_images', 'odontogram_entry_images'] as $table) {
            $this->assertTrue(Schema::hasColumn($table, 'scan_status'), "{$table} is missing scan_status");
            $this->assertTrue(Schema::hasColumn($table, 'scan_result'), "{$table} is missing scan_result");
            $this->assertTrue(Schema::hasColumn($table, 'scan_provider'), "{$table} is missing scan_provider");
            $this->assertTrue(Schema::hasColumn($table, 'quarantine_path'), "{$table} is missing quarantine_path");
            $this->assertTrue(Schema::hasColumn($table, 'approved_at'), "{$table} is missing approved_at");
            $this->assertTrue(Schema::hasColumn($table, 'scanned_at'), "{$table} is missing scanned_at");
            $this->assertTrue(Schema::hasColumn($table, 'rejected_at'), "{$table} is missing rejected_at");
        }
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
            ->assertJsonPath('data.photo_scan_status', 'pending');
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

    public function test_infected_odontogram_image_upload_is_rejected(): void
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
        $entry = OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}/images", [
                'stage' => 'before',
                'image' => UploadedFile::fake()->image('infected.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['image']);

        $this->assertDatabaseHas('odontogram_entry_images', [
            'odontogram_entry_id' => $entry->id,
            'scan_status' => 'rejected',
        ]);
        $this->assertFalse(collect(Storage::disk('local')->allFiles())->contains(
            fn (string $path): bool => str_starts_with($path, 'quarantine/')
        ));
    }

    public function test_pending_odontogram_image_cannot_be_downloaded(): void
    {
        Storage::fake('local');
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $entry = OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $quarantinePath = 'quarantine/odontogram/pending.jpg';
        $image = UploadedFile::fake()->image('pending.jpg', 800, 600);
        Storage::disk('local')->put($quarantinePath, file_get_contents((string) $image->getRealPath()));

        $record = OdontogramEntryImage::query()->create([
            'dentist_id' => $dentist->id,
            'odontogram_entry_id' => $entry->id,
            'stage' => 'before',
            'disk' => 'local',
            'path' => $quarantinePath,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($quarantinePath),
            'scan_status' => 'pending',
            'quarantine_path' => $quarantinePath,
        ]);

        $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}/images/{$record->id}")
            ->assertNotFound();
    }

    public function test_pending_media_response_has_scan_status_and_no_urls(): void
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

        $entry = OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        OdontogramEntryImage::query()->create([
            'dentist_id' => $dentist->id,
            'odontogram_entry_id' => $entry->id,
            'stage' => 'before',
            'disk' => 'local',
            'path' => 'quarantine/odontogram/pending-response.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 123,
            'scan_status' => 'pending',
            'quarantine_path' => 'quarantine/odontogram/pending-response.jpg',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/odontogram")
            ->assertOk()
            ->assertJsonPath('data.0.images.0.scan_status', 'pending')
            ->assertJsonPath('data.0.images.0.url', null)
            ->assertJsonPath('data.0.images.0.thumbnail_url', null)
            ->assertJsonPath('data.0.images.0.preview_url', null);
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

    public function test_infected_odontogram_image_direct_upload_is_rejected(): void
    {
        Storage::fake('local');
        $this->bindInfectedScanner();

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $entry = OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $uploadId = 'odontogram-direct-infected';
        $path = 'quarantine/odontogram/direct-infected.jpg';
        $image = UploadedFile::fake()->image('direct-infected.jpg', 800, 600);
        Storage::disk('local')->put($path, file_get_contents((string) $image->getRealPath()));
        Cache::put("odontogram-image-upload:{$uploadId}", [
            'dentist_id' => $dentist->id,
            'patient_id' => (string) $patient->id,
            'entry_id' => (string) $entry->id,
            'stage' => 'before',
            'disk' => 'local',
            'path' => $path,
            'mime_type' => 'image/jpeg',
            'file_size' => Storage::disk('local')->size($path),
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}/images/direct-upload/{$uploadId}/complete")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['image']);

        $this->assertDatabaseHas('odontogram_entry_images', [
            'odontogram_entry_id' => $entry->id,
            'scan_status' => 'rejected',
        ]);
        Storage::disk('local')->assertMissing($path);
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
