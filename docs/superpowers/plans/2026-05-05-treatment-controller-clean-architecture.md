# Treatment Controller Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `PatientTreatmentController` into services and API resources while preserving all existing treatment API behavior.

**Architecture:** Keep routes, FormRequests, middleware, permission checks, and response shapes unchanged. Extract treatment query/business behavior into `TreatmentService`, image/storage behavior into `TreatmentImageService`, direct upload behavior into `App\Services\TreatmentImageDirectUploadService`, and treatment JSON formatting into Laravel-style resources.

**Tech Stack:** Laravel 12, Eloquent, FormRequest validation, Sanctum auth, queued media jobs, GD image handling, PHPUnit feature tests, Laravel Pint.

---

## File Structure

- Create `backend/app/Services/TreatmentService.php`: tenant lookup, list queries, create/update/delete treatment logic, payload normalization, audit logging.
- Create `backend/app/Services/TreatmentImageService.php`: image upload, storage paths, URL generation, streaming, variant queueing, cleanup, image response helper.
- Move `backend/app/Support/TreatmentImageDirectUploadService.php` to `backend/app/Services/TreatmentImageDirectUploadService.php`: keep direct-upload ticket and batch logic intact, only namespace/import changes.
- Create `backend/app/Http/Resources/TreatmentResource.php`: exact treatment JSON shape.
- Create `backend/app/Http/Resources/TreatmentImageResource.php`: exact image JSON shape.
- Modify `backend/app/Http/Controllers/Api/PatientTreatmentController.php`: thin request/response coordinator.
- Modify tests only if a new exact response compatibility assertion is needed.

## Task 1: Baseline Verification

**Files:**
- Read: `backend/app/Http/Controllers/Api/PatientTreatmentController.php`
- Test: existing treatment/media tests

- [ ] **Step 1: Run treatment baseline tests**

Run:

```powershell
& 'C:\Users\yunusdjanov\Documents\Codex\2026-05-05\hey-i-have-a-project-that\php-runtime\php-8.4.20\php.exe' artisan test --filter='OdontogramTreatmentApiTest|MediaUploadSecurityTest|StrictTenantIsolationTest'
```

Expected: all tests pass before refactor.

## Task 2: Move Direct Upload Service Namespace

**Files:**
- Move: `backend/app/Support/TreatmentImageDirectUploadService.php`
- Create: `backend/app/Services/TreatmentImageDirectUploadService.php`
- Modify: `backend/app/Http/Controllers/Api/PatientTreatmentController.php`

- [ ] **Step 1: Move service namespace**

Change namespace:

```php
namespace App\Services;
```

Keep the class name `TreatmentImageDirectUploadService` and method signatures unchanged.

- [ ] **Step 2: Update controller import**

Replace:

```php
use App\Support\TreatmentImageDirectUploadService;
```

With:

```php
use App\Services\TreatmentImageDirectUploadService;
```

- [ ] **Step 3: Run direct upload tests**

Run:

```powershell
& 'C:\Users\yunusdjanov\Documents\Codex\2026-05-05\hey-i-have-a-project-that\php-runtime\php-8.4.20\php.exe' artisan test --filter='prepare treatment image upload|direct upload|batch direct upload'
```

Expected: direct upload tests pass.

## Task 3: Add Treatment Image Resource

**Files:**
- Create: `backend/app/Http/Resources/TreatmentImageResource.php`
- Modify later: `backend/app/Http/Controllers/Api/PatientTreatmentController.php`

- [ ] **Step 1: Create exact image resource wrapper**

Create a resource that accepts a `Treatment`, `TreatmentImage`, and a resolved payload array:

```php
final class TreatmentImageResource extends JsonResource
{
    public function __construct(
        private readonly Treatment $treatment,
        private readonly TreatmentImage $image,
        private readonly array $payload
    ) {
        parent::__construct($image);
    }

    public function toArray(Request $request): array
    {
        return $this->payload;
    }
}
```

This first pass deliberately preserves the current exact transform output while giving the controller a Resource boundary.

- [ ] **Step 2: Wire resource after image service extraction**

Use `TreatmentImageResource` only after `TreatmentImageService` owns the image payload generation.

## Task 4: Add Treatment Image Service

**Files:**
- Create: `backend/app/Services/TreatmentImageService.php`
- Modify: `backend/app/Http/Controllers/Api/PatientTreatmentController.php`

- [ ] **Step 1: Extract image-only methods**

Move these methods from the controller into `TreatmentImageService` with the same behavior:

```php
storeTreatmentImage()
deleteTreatmentImageFile()
deleteAllTreatmentImages()
transformTreatmentImage()
buildTreatmentImageUrl()
resolveTreatmentImagePath()
buildTreatmentImageVariantPath()
buildTreatmentImageVariantDefinitions()
queueTreatmentImageVariants()
streamTreatmentImageVariant()
streamStoredTreatmentImage()
buildTreatmentImageDeletePaths()
imageCacheControlHeader()
guessImageMimeType()
mediaDisk()
mediaDiskSupportsDirectUpload()
mediaPathExists()
shouldSkipRemoteMediaPathLookup()
buildTemporaryMediaUrl()
resolveUploadedObjectSize()
buildTreatmentImageStoragePath()
resolveUploadExtension()
normalizeTemporaryUploadHeaders()
deleteDirectUploadObject()
```

Service constructor dependencies:

```php
public function __construct(
    private readonly ImageCompressionService $imageCompressionService,
    private readonly PlanLimitService $planLimitService,
) {
}
```

- [ ] **Step 2: Keep public methods small and controller-friendly**

Expose these methods:

```php
public function upload(Request $request, User $owner, int $dentistId, string $patientId, Treatment $treatment, UploadedFile $file): Treatment;
public function deleteImage(Treatment $treatment, string $imageId): void;
public function deleteAllImages(Treatment $treatment): void;
public function streamImage(Request $request, Treatment $treatment, string $imageId): StreamedResponse;
public function imagePayload(Treatment $treatment, TreatmentImage $image): array;
```

- [ ] **Step 3: Run image tests**

Run:

```powershell
& 'C:\Users\yunusdjanov\Documents\Codex\2026-05-05\hey-i-have-a-project-that\php-runtime\php-8.4.20\php.exe' artisan test --filter='OdontogramTreatmentApiTest|MediaUploadSecurityTest'
```

Expected: all image behavior remains unchanged.

## Task 5: Add Treatment Resource

**Files:**
- Create: `backend/app/Http/Resources/TreatmentResource.php`
- Modify: `backend/app/Http/Controllers/Api/PatientTreatmentController.php`

- [ ] **Step 1: Create exact treatment resource**

The resource accepts the current flags and `TreatmentImageService`:

```php
final class TreatmentResource extends JsonResource
{
    public function __construct(
        Treatment $resource,
        private readonly TreatmentImageService $images,
        private readonly bool $includeImages = false,
        private readonly bool $includePatient = false
    ) {
        parent::__construct($resource);
    }
}
```

`toArray()` must return the same keys currently returned by `transformTreatment()`.

- [ ] **Step 2: Replace controller transform calls**

Replace:

```php
$this->transformTreatment($treatment, $includeImages)
```

With:

```php
(new TreatmentResource($treatment, $this->treatmentImages, $includeImages))->resolve($request)
```

- [ ] **Step 3: Run response tests**

Run:

```powershell
& 'C:\Users\yunusdjanov\Documents\Codex\2026-05-05\hey-i-have-a-project-that\php-runtime\php-8.4.20\php.exe' artisan test --filter='dentist can create and list owned treatments|pending media response has scan status'
```

Expected: response JSON paths match existing tests.

## Task 6: Add Treatment Service

**Files:**
- Create: `backend/app/Services/TreatmentService.php`
- Modify: `backend/app/Http/Controllers/Api/PatientTreatmentController.php`

- [ ] **Step 1: Extract lookup and query methods**

Move:

```php
findOwnedPatient()
resolveDentistId()
resolveSubscriptionOwner()
resolvePerPage()
applySort()
findOwnedTreatment()
buildTreatmentPayload()
normalizeTeeth()
shouldIncludeImages()
shouldIncludeSummary()
treatmentMessage()
```

Expose request-friendly service methods:

```php
public function listForPatient(Request $request, string $patientId): LengthAwarePaginator;
public function listAll(Request $request): array;
public function show(Request $request, string $patientId, string $treatmentId): Treatment;
public function create(StoreTreatmentRequest $request, string $patientId): Treatment;
public function update(UpdateTreatmentRequest $request, string $patientId, string $treatmentId): Treatment;
public function delete(Request $request, string $patientId, string $treatmentId): void;
public function dentistId(Request $request): int;
public function subscriptionOwner(Request $request): User;
public function ownedPatient(Request $request, string $patientId): Patient;
public function ownedTreatment(Request $request, string $patientId, string $treatmentId): Treatment;
public function includeImages(Request $request): bool;
public function includeSummary(Request $request): bool;
```

- [ ] **Step 2: Keep controller response assembly only**

Controller methods should call service methods, wrap with resources, and return JSON/stream responses.

- [ ] **Step 3: Run treatment tests**

Run:

```powershell
& 'C:\Users\yunusdjanov\Documents\Codex\2026-05-05\hey-i-have-a-project-that\php-runtime\php-8.4.20\php.exe' artisan test --filter='OdontogramTreatmentApiTest|StrictTenantIsolationTest'
```

Expected: all treatment and tenant tests pass.

## Task 7: Final Cleanup And Verification

**Files:**
- Modify: touched PHP files

- [ ] **Step 1: Run Pint on touched files**

Run:

```powershell
& 'C:\Users\yunusdjanov\Documents\Codex\2026-05-05\hey-i-have-a-project-that\php-runtime\php-8.4.20\php.exe' vendor\bin\pint app\Http\Controllers\Api\PatientTreatmentController.php app\Services\TreatmentService.php app\Services\TreatmentImageService.php app\Services\TreatmentImageDirectUploadService.php app\Http\Resources\TreatmentResource.php app\Http\Resources\TreatmentImageResource.php
```

Expected: Pint completes successfully.

- [ ] **Step 2: Run full backend tests**

Run:

```powershell
& 'C:\Users\yunusdjanov\Documents\Codex\2026-05-05\hey-i-have-a-project-that\php-runtime\php-8.4.20\php.exe' artisan test
```

Expected: all backend tests pass.

## Self-Review

Spec coverage:

- Services: covered by Tasks 4 and 6.
- Optional repositories: explicitly omitted by design.
- Thin controller: covered by Task 6.
- API Resources: covered by Tasks 3 and 5.
- No breaking API changes: covered by response compatibility and existing tests.
- Validation remains in FormRequests: no FormRequest changes are planned.

Placeholder scan: no deferred implementation placeholders are used; each task names exact files, commands, and method boundaries.

Type consistency: services use existing Laravel models, requests, `JsonResponse`, and `StreamedResponse`; resources are Laravel `JsonResource` subclasses.
