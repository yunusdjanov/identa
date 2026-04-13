<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\OdontogramEntry;
use App\Models\Patient;
use App\Models\Treatment;
use App\Models\TreatmentImage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class OdontogramTreatmentApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_can_create_and_list_owned_odontogram_entries(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/odontogram", [
                'tooth_number' => 12,
                'condition_type' => 'cavity',
                'surface' => 'occlusal',
                'condition_date' => '2026-02-14',
                'notes' => 'Initial finding',
            ])
            ->assertCreated()
            ->assertJsonPath('data.tooth_number', 12)
            ->assertJsonPath('data.condition_type', 'cavity');

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/odontogram")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.tooth_number', 12)
            ->assertJsonPath('data.0.condition_type', 'cavity');

        OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'tooth_number' => 12,
            'condition_type' => 'filling',
            'condition_date' => '2026-02-16',
        ]);
        OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'tooth_number' => 20,
            'condition_type' => 'crown',
            'condition_date' => '2026-02-15',
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/odontogram/summary?limit=1")
            ->assertOk()
            ->assertJsonPath('data.total_entries', 3)
            ->assertJsonPath('data.affected_teeth_count', 2)
            ->assertJsonCount(1, 'data.latest_conditions')
            ->assertJsonPath('data.latest_conditions.0.tooth_number', 12)
            ->assertJsonPath('data.latest_conditions.0.condition_type', 'filling')
            ->assertJsonPath('data.latest_conditions.0.history_count', 2);
    }

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
            ->assertJsonPath('data.balance', 60);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/treatments")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.tooth_number', 12)
            ->assertJsonPath('data.0.teeth.0', 12)
            ->assertJsonPath('data.0.teeth.1', 13)
            ->assertJsonPath('data.0.comment', 'Upper right restoration')
            ->assertJsonPath('data.0.treatment_type', 'Filling');
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
            ->assertJsonPath('data.balance', 250);

        $firstUpload = $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images", [
                'image' => UploadedFile::fake()->image('first.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonCount(1, 'data.images');

        $firstImageId = $firstUpload->json('data.images.0.id');
        $this->assertIsString($firstImageId);
        $thumbnailUrl = $firstUpload->json('data.images.0.thumbnail_url');
        $previewUrl = $firstUpload->json('data.images.0.preview_url');
        $this->assertIsString($thumbnailUrl);
        $this->assertIsString($previewUrl);
        $this->assertStringContainsString('variant=thumbnail', $thumbnailUrl);
        $this->assertStringContainsString('variant=preview', $previewUrl);
        $firstImage = TreatmentImage::query()->findOrFail($firstImageId);
        $firstPath = (string) $firstImage->path;
        $firstThumbnailPath = sprintf(
            '%s/variants/%s-thumbnail.%s',
            dirname($firstPath),
            pathinfo($firstPath, PATHINFO_FILENAME),
            pathinfo($firstPath, PATHINFO_EXTENSION)
        );
        Storage::disk('local')->assertExists($firstPath);
        Storage::disk('local')->assertExists($firstThumbnailPath);

        $secondUpload = $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images", [
                'image' => UploadedFile::fake()->image('second.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonCount(2, 'data.images');

        $secondImageId = $secondUpload->json('data.images.1.id');
        $this->assertIsString($secondImageId);

        $downloadResponse = $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/{$firstImageId}");
        $downloadResponse->assertOk();
        $this->assertStringContainsString('image/', (string) $downloadResponse->headers->get('Content-Type'));

        $thumbnailResponse = $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/{$firstImageId}?variant=thumbnail");
        $thumbnailResponse->assertOk();
        $this->assertStringContainsString('image/', (string) $thumbnailResponse->headers->get('Content-Type'));

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images/{$secondImageId}")
            ->assertOk()
            ->assertJsonCount(1, 'data.images');

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('treatments', ['id' => $treatment->id]);
        Storage::disk('local')->assertMissing($firstPath);
        Storage::disk('local')->assertMissing($firstThumbnailPath);
    }

    public function test_treatment_images_are_limited_to_ten_files_per_entry(): void
    {
        Storage::fake('local');

        $dentist = User::factory()->create();
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
                ->assertOk();
        }

        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/treatments/{$treatment->id}/images", [
                'image' => UploadedFile::fake()->image('overflow.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['image']);
    }

    public function test_dentist_can_update_delete_and_manage_images_for_owned_odontogram_entry(): void
    {
        Storage::fake('local');

        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $entry = OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'tooth_number' => 8,
            'condition_type' => 'cavity',
            'condition_date' => '2026-03-08',
        ]);

        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}", [
                'tooth_number' => 8,
                'condition_type' => 'filling',
                'material' => 'composite',
                'condition_date' => '2026-03-09',
                'notes' => 'Updated record',
            ])
            ->assertOk()
            ->assertJsonPath('data.condition_type', 'filling')
            ->assertJsonPath('data.material', 'composite');

        $beforeUpload = $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}/images", [
                'stage' => 'before',
                'captured_at' => '2026-03-08',
                'image' => UploadedFile::fake()->image('before.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonCount(1, 'data.images');

        $beforeImageId = $beforeUpload->json('data.images.0.id');
        $this->assertIsString($beforeImageId);

        $replacementUpload = $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}/images", [
                'stage' => 'before',
                'captured_at' => '2026-03-09',
                'image' => UploadedFile::fake()->image('before-replace.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonCount(1, 'data.images');

        $this->assertSame($beforeImageId, $replacementUpload->json('data.images.0.id'));

        $afterUpload = $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}/images", [
                'stage' => 'after',
                'captured_at' => '2026-03-10',
                'image' => UploadedFile::fake()->image('after.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->assertJsonCount(2, 'data.images');

        $afterImageId = collect($afterUpload->json('data.images'))
            ->firstWhere('stage', 'after')['id'] ?? null;
        $this->assertIsString($afterImageId);

        $downloadResponse = $this->actingAs($dentist, 'web')
            ->get("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}/images/{$beforeImageId}");
        $downloadResponse->assertOk();
        $this->assertStringContainsString('image/', (string) $downloadResponse->headers->get('Content-Type'));

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}/images/{$afterImageId}")
            ->assertNoContent();

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}")
            ->assertNoContent();

        $this->assertDatabaseMissing('odontogram_entries', ['id' => $entry->id]);
    }

    public function test_dentist_cannot_delete_odontogram_entry_when_linked_to_billing(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);
        $entry = OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);

        $invoice = Invoice::create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
            'invoice_number' => 'INV-2603-0001',
            'invoice_date' => '2026-03-08',
            'total_amount' => '100.00',
            'paid_amount' => '0.00',
            'balance' => '100.00',
            'status' => Invoice::STATUS_UNPAID,
        ]);

        InvoiceItem::create([
            'invoice_id' => $invoice->id,
            'odontogram_entry_id' => $entry->id,
            'description' => 'Tooth treatment',
            'quantity' => 1,
            'unit_price' => '100.00',
            'total_price' => '100.00',
            'sort_order' => 0,
        ]);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['entry']);
    }

    public function test_archived_patient_keeps_read_access_and_blocks_new_odontogram_and_treatment_entries(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        OdontogramEntry::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);
        Treatment::factory()->create([
            'dentist_id' => $dentist->id,
            'patient_id' => $patient->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}")
            ->assertNoContent();

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/odontogram")
            ->assertOk();
        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/odontogram/summary")
            ->assertOk();
        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/treatments")
            ->assertOk();

        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/odontogram", [
                'tooth_number' => 10,
                'condition_type' => 'cavity',
                'condition_date' => '2026-02-14',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['patient']);
        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$patient->id}/treatments", [
                'treatment_type' => 'Cleaning',
                'treatment_date' => '2026-02-14',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['patient']);

        $entry = OdontogramEntry::query()
            ->where('patient_id', $patient->id)
            ->firstOrFail();
        $this->actingAs($dentist, 'web')
            ->putJson("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}", [
                'tooth_number' => $entry->tooth_number,
                'condition_type' => $entry->condition_type,
                'condition_date' => '2026-02-15',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['patient']);
        $this->actingAs($dentist, 'web')
            ->deleteJson("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['patient']);
        $this->actingAs($dentist, 'web')
            ->post("/api/v1/patients/{$patient->id}/odontogram/{$entry->id}/images", [
                'stage' => 'before',
                'image' => UploadedFile::fake()->image('archived.jpg', 800, 600),
            ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['patient']);
    }

    public function test_dentist_cannot_access_other_dentist_odontogram_or_treatments(): void
    {
        $dentist = User::factory()->create();
        $otherDentist = User::factory()->create();
        $otherPatient = Patient::factory()->create(['dentist_id' => $otherDentist->id]);

        OdontogramEntry::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
        ]);
        Treatment::factory()->create([
            'dentist_id' => $otherDentist->id,
            'patient_id' => $otherPatient->id,
        ]);

        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$otherPatient->id}/odontogram")
            ->assertNotFound();
        $this->actingAs($dentist, 'web')
            ->getJson("/api/v1/patients/{$otherPatient->id}/odontogram/summary")
            ->assertNotFound();
        $this->actingAs($dentist, 'web')
            ->postJson("/api/v1/patients/{$otherPatient->id}/odontogram", [
                'tooth_number' => 10,
                'condition_type' => 'cavity',
                'condition_date' => '2026-02-14',
            ])
            ->assertNotFound();

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

    public function test_guest_is_unauthorized_and_admin_forbidden_for_odontogram_and_treatment_routes(): void
    {
        $dentist = User::factory()->create();
        $patient = Patient::factory()->create(['dentist_id' => $dentist->id]);

        $this->getJson("/api/v1/patients/{$patient->id}/odontogram")->assertUnauthorized();
        $this->getJson("/api/v1/patients/{$patient->id}/odontogram/summary")->assertUnauthorized();
        $this->getJson("/api/v1/patients/{$patient->id}/treatments")->assertUnauthorized();

        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/odontogram")
            ->assertForbidden();
        $this->actingAs($admin, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/odontogram/summary")
            ->assertForbidden();
        $this->actingAs($admin, 'web')
            ->getJson("/api/v1/patients/{$patient->id}/treatments")
            ->assertForbidden();
    }
}
