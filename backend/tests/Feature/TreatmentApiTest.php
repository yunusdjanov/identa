<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TreatmentApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_create_and_list_owned_treatments(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/treatments", [
                'teeth' => [12, 13],
                'treatment_type' => 'Filling',
                'description' => 'Composite filling',
                'comment' => 'Upper right restoration',
                'treatment_date' => '2026-02-14',
                'debt_amount' => 100,
                'paid_amount' => 40,
                'notes' => 'Completed',
            ])
            ->assertCreated()
            ->assertJsonPath('data.tooth_number', 12)
            ->assertJsonPath('data.teeth.0', 12)
            ->assertJsonPath('data.teeth.1', 13)
            ->assertJsonPath('data.treatment_type', 'Filling')
            ->assertJsonPath('data.debt_amount', 100)
            ->assertJsonPath('data.paid_amount', 40)
            ->assertJsonPath('data.created_by.id', (string) $dentist->id)
            ->assertJsonPath('data.updated_by.id', (string) $dentist->id)
            ->assertJsonPath('data.balance', 60);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/treatments")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.tooth_number', 12)
            ->assertJsonPath('data.0.teeth.0', 12)
            ->assertJsonPath('data.0.teeth.1', 13)
            ->assertJsonPath('data.0.comment', 'Upper right restoration')
            ->assertJsonPath('data.0.created_by.id', (string) $dentist->id)
            ->assertJsonPath('data.0.treatment_type', 'Filling');
    }

    public function test_treatment_financial_values_must_fit_database_decimal_columns(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/treatments", [
                'treatment_type' => 'Overflow guard',
                'treatment_date' => '2026-02-14',
                'cost' => 10_000_000_000,
                'debt_amount' => 10_000_000_000,
                'paid_amount' => 10_000_000_000,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['cost', 'debt_amount', 'paid_amount']);
    }

    public function test_creating_treatment_moves_patient_to_top_of_patient_list(): void
    {
        $dentist = User::factory()->create();
        $workedPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Worked Patient',
            'updated_at' => now()->subDays(5),
        ]);
        Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Previously First Patient',
            'updated_at' => now()->subDay(),
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$workedPatient->id}/treatments", [
                'teeth' => [12],
                'treatment_type' => 'Filling',
                'treatment_date' => '2026-02-14',
                'debt_amount' => 100,
                'paid_amount' => 40,
            ])
            ->assertCreated();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients')
            ->assertOk()
            ->assertJsonPath('data.0.id', (string) $workedPatient->id)
            ->assertJsonPath('data.0.full_name', 'Worked Patient');
    }

    public function test_updating_treatment_moves_patient_to_top_of_patient_list(): void
    {
        $dentist = User::factory()->create();
        $workedPatient = Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Edited Entry Patient',
            'updated_at' => now()->subDays(5),
        ]);
        Patient::factory()->create([
            'dentist_id' => $dentist->id,
            'full_name' => 'Unchanged Patient',
            'updated_at' => now()->subDay(),
        ]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $workedPatient->id,
            'treatment_type' => 'Old work',
            'treatment_date' => '2026-02-14',
        ]);
        $workedPatient->forceFill(['updated_at' => now()->subDays(5)])->saveQuietly();

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/patients/{$workedPatient->id}/treatments/{$treatment->id}", [
                'teeth' => [12],
                'treatment_type' => 'Updated work',
                'treatment_date' => '2026-02-15',
                'debt_amount' => 200,
                'paid_amount' => 100,
            ])
            ->assertOk();

        $this->actingAs($dentist, 'web')
            ->getJson('/api/v1/patients')
            ->assertOk()
            ->assertJsonPath('data.0.id', (string) $workedPatient->id)
            ->assertJsonPath('data.0.full_name', 'Edited Entry Patient');
    }

    public function test_patient_treatments_are_paginated_newest_first_with_summary(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'treatment_type' => 'Older work',
            'treatment_date' => '2026-06-01',
            'debt_amount' => 100_000,
            'paid_amount' => 50_000,
        ]);
        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'treatment_type' => 'Middle work',
            'treatment_date' => '2026-06-10',
            'debt_amount' => 200_000,
            'paid_amount' => 100_000,
        ]);
        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'treatment_type' => 'Newest work',
            'treatment_date' => '2026-06-15',
            'debt_amount' => 300_000,
            'paid_amount' => 150_000,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/treatments?per_page=2&include_summary=1&sort=-treatment_date,-created_at")
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.treatment_type', 'Newest work')
            ->assertJsonPath('data.1.treatment_type', 'Middle work')
            ->assertJsonPath('meta.pagination.per_page', 2)
            ->assertJsonPath('meta.pagination.total', 3)
            ->assertJsonPath('meta.pagination.total_pages', 2)
            ->assertJsonPath('meta.summary.total_count', 3)
            ->assertJsonPath('meta.summary.total_debt', 600000)
            ->assertJsonPath('meta.summary.total_paid', 300000)
            ->assertJsonPath('meta.summary.total_balance', 300000);
    }

    public function test_treatment_entry_keeps_its_own_paid_amount_and_supports_credit(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $created = $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/treatments", [
                'teeth' => [21],
                'treatment_type' => 'Treatment credit',
                'treatment_date' => '2026-02-14',
                'debt_amount' => 0,
                'paid_amount' => 60000,
            ])
            ->assertCreated()
            ->assertJsonPath('data.debt_amount', 0)
            ->assertJsonPath('data.paid_amount', 60000)
            ->assertJsonPath('data.balance', -60000);

        $treatmentId = $created->json('data.id');
        $this->assertIsString($treatmentId);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/patients/{$patient->id}/treatments/{$treatmentId}", [
                'teeth' => [21],
                'treatment_type' => 'Treatment with credit',
                'treatment_date' => '2026-02-15',
                'debt_amount' => 100,
                'paid_amount' => 250,
            ])
            ->assertOk()
            ->assertJsonPath('data.debt_amount', 100)
            ->assertJsonPath('data.paid_amount', 250)
            ->assertJsonPath('data.balance', -150);
    }

    public function test_dentist_can_update_delete_and_manage_images_for_owned_treatments(): void
    {
        Storage::fake('local');

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'tooth_number' => 8,
            'teeth' => [8],
            'treatment_type' => 'Crown',
            'description' => 'Old description',
            'comment' => 'Old comment',
            'debt_amount' => '200.00',
            'paid_amount' => '50.00',
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}", [
                'teeth' => [8, 9],
                'treatment_type' => 'Bridge',
                'description' => 'Updated work history',
                'comment' => 'Updated comment',
                'treatment_date' => '2026-03-09',
                'debt_amount' => 350,
                'paid_amount' => 100,
            ])
            ->assertOk()
            ->assertJsonPath('data.teeth.0', 8)
            ->assertJsonPath('data.teeth.1', 9)
            ->assertJsonPath('data.treatment_type', 'Bridge')
            ->assertJsonPath('data.updated_by.id', (string) $dentist->id)
            ->assertJsonPath('data.balance', 250);

        $this->assertDatabaseHas('treatments', [
            'id' => $treatment->id,
            'updated_by_user_id' => $dentist->id,
        ]);

        $firstUpload = $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images", [
                'image' => UploadedFile::fake()->image('first.jpg', 2600, 1800),
            ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonCount(1, 'data.images');

        $firstImageId = $firstUpload->json('data.images.0.id');
        $this->assertIsString($firstImageId);
        $thumbnailUrl = $firstUpload->json('data.images.0.thumbnail_url');
        $previewUrl = $firstUpload->json('data.images.0.preview_url');
        $editorUrl = $firstUpload->json('data.images.0.editor_url');
        $this->assertIsString($thumbnailUrl);
        $this->assertIsString($previewUrl);
        $this->assertIsString($editorUrl);
        $this->assertNotSame('', $thumbnailUrl);
        $this->assertNotSame('', $previewUrl);
        $this->assertStringContainsString('/api/v1/patients/', $editorUrl);
        $this->assertStringContainsString('?v=', $editorUrl);
        $firstImage = TreatmentImage::query()->findOrFail($firstImageId);
        $firstPath = (string) $firstImage->path;
        $firstThumbnailPath = sprintf(
            '%s/variants/%s-thumbnail.%s',
            dirname($firstPath),
            pathinfo($firstPath, PATHINFO_FILENAME),
            pathinfo($firstPath, PATHINFO_EXTENSION)
        );
        $firstPreviewPath = sprintf(
            '%s/variants/%s-preview.%s',
            dirname($firstPath),
            pathinfo($firstPath, PATHINFO_FILENAME),
            pathinfo($firstPath, PATHINFO_EXTENSION)
        );
        Storage::disk('local')->assertExists($firstPath);
        Storage::disk('local')->assertExists($firstThumbnailPath);
        Storage::disk('local')->assertExists($firstPreviewPath);
        Storage::disk('local')->delete([$firstThumbnailPath, $firstPreviewPath]);
        Storage::disk('local')->assertMissing($firstThumbnailPath);
        Storage::disk('local')->assertMissing($firstPreviewPath);

        $downloadResponse = $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/{$firstImageId}");
        $downloadResponse->assertOk();
        $this->assertStringContainsString('image/', (string) $downloadResponse->headers->get('Content-Type'));
        $originalBytes = strlen($downloadResponse->streamedContent());

        $thumbnailResponse = $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/{$firstImageId}?variant=thumbnail");
        $thumbnailResponse->assertOk();
        $this->assertStringContainsString('image/', (string) $thumbnailResponse->headers->get('Content-Type'));
        $thumbnailBytes = strlen($thumbnailResponse->streamedContent());

        $previewResponse = $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/{$firstImageId}?variant=preview");
        $previewResponse->assertOk();
        $this->assertStringContainsString('image/', (string) $previewResponse->headers->get('Content-Type'));
        $previewBytes = strlen($previewResponse->streamedContent());

        $this->assertGreaterThan(0, $originalBytes);
        $this->assertGreaterThan(0, $thumbnailBytes);
        $this->assertGreaterThan(0, $previewBytes);
        Storage::disk('local')->assertExists($firstThumbnailPath);
        Storage::disk('local')->assertExists($firstPreviewPath);

        $secondUpload = $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images", [
                'image' => UploadedFile::fake()->image('second.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonCount(2, 'data.images');

        $secondImageId = $secondUpload->json('data.images.1.id');
        $this->assertIsString($secondImageId);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/{$secondImageId}")
            ->assertNoContent();

        $this->assertDatabaseMissing('treatment_images', ['id' => $secondImageId]);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('treatments', ['id' => $treatment->id]);
        Storage::disk('local')->assertMissing($firstPath);
        Storage::disk('local')->assertMissing($firstThumbnailPath);
        Storage::disk('local')->assertMissing($firstPreviewPath);
    }

    public function test_treatment_images_are_limited_to_ten_files_per_entry(): void
    {
        Storage::fake('local');

        $dentist = User::factory()->create();
        $dentist->activatePaidSubscription(User::SUBSCRIPTION_PLAN_YEARLY);
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);

        for ($index = 1; $index <= 10; $index++) {
            $this->actingAs($dentist, 'web')
                ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images", [
                    'image' => UploadedFile::fake()->image("image-{$index}.jpg", 800, 600),
                ], ['Accept' => 'application/json'])
                ->assertCreated();
        }

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images", [
                'image' => UploadedFile::fake()->image('overflow.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertForbidden()
            ->assertJsonPath('error.code', 'plan_entry_image_limit_reached');
    }

    public function test_treatment_image_can_be_replaced_when_entry_image_limit_is_reached(): void
    {
        Storage::fake('local');

        $dentist = User::factory()->create();
        $dentist->activatePaidSubscription(User::SUBSCRIPTION_PLAN_YEARLY);
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        $firstImageId = null;

        for ($index = 1; $index <= 10; $index++) {
            $response = $this->actingAs($dentist, 'web')
                ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images", [
                    'image' => UploadedFile::fake()->image("image-{$index}.jpg", 800, 600),
                ], ['Accept' => 'application/json'])
                ->assertCreated();

            $firstImageId ??= (string) $response->json('data.images.0.id');
        }

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/{$firstImageId}/replace", [
                'image' => UploadedFile::fake()->image('edited-image.jpg', 1000, 700),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonCount(10, 'data.images')
            ->assertJsonPath('data.images.0.id', $firstImageId);

        $this->assertSame(10, TreatmentImage::query()
            ->where('treatment_id', $treatment->id)
            ->count());
        $this->assertDatabaseHas('treatment_images', [
            'id' => $firstImageId,
            'scan_status' => 'approved',
            'quarantine_path' => null,
        ]);
    }

    public function test_prepare_treatment_image_upload_reports_fallback_when_disk_does_not_support_direct_upload(): void
    {
        Storage::fake('local');

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $treatment = Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/direct-upload", [
                'filename' => 'first.jpg',
                'content_type' => 'image/jpeg',
                'file_size' => 128000,
            ])
            ->assertOk()
            ->assertJsonPath('data.supported', false);
    }

    public function test_archived_patient_keeps_treatment_read_access_and_blocks_new_entries(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}")
            ->assertNoContent();

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/treatments")
            ->assertOk();

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/treatments", [
                'treatment_type' => 'Cleaning',
                'treatment_date' => '2026-02-14',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['patient']);
    }

    public function test_dentist_cannot_access_other_dentist_treatments(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);

        Treatment::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$otherPatient->id}/treatments")
            ->assertNotFound();
        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$otherPatient->id}/treatments", [
                'treatment_type' => 'Cleaning',
                'treatment_date' => '2026-02-14',
            ])
            ->assertNotFound();
    }

    public function test_guest_is_unauthorized_and_admin_forbidden_for_treatment_routes(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->getJson("/api/v1/patients/{$patient->id}/treatments")->assertUnauthorized();

        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/treatments")
            ->assertForbidden();
    }
}
