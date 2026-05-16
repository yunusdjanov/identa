# Patient Controller Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `PatientController` into thin request/response actions while preserving the existing patient API contract.

**Architecture:** Move patient query/CRUD/overview logic into `PatientService`, patient photo upload/direct-upload/stream/delete logic into `PatientPhotoService`, and patient response formatting into `PatientResource`. Keep route middleware, validation requests, audit events, tenant checks, subscription limits, scan lifecycle, and media URL behavior unchanged.

**Tech Stack:** Laravel controllers, services, API resources, Eloquent, FormRequests, queues, Laravel Storage, PHPUnit/Pest feature tests, Pint.

---

### Task 1: Baseline Verification

**Files:**
- Read: `backend/app/Http/Controllers/Api/PatientController.php`
- Test: `backend/tests/Feature/PatientApiTest.php`
- Test: `backend/tests/Feature/MediaUploadSecurityTest.php`
- Test: `backend/tests/Feature/StrictTenantIsolationTest.php`

- [ ] Run `PatientApiTest`, `MediaUploadSecurityTest`, and `StrictTenantIsolationTest` before edits.
- [ ] Confirm current behavior is green so refactor regressions are obvious.

### Task 2: Patient Resource

**Files:**
- Create: `backend/app/Http/Resources/PatientResource.php`
- Use: `backend/app/Services/PatientPhotoService.php`

- [ ] Move the exact patient payload shape from `PatientController::transformPatient()` into `PatientResource`.
- [ ] Keep `photo_url`, thumbnail/preview URLs, readiness flags, archive fields, last visit, and categories unchanged.
- [ ] Use `PatientPhotoService` for photo URL/readiness helpers.

### Task 3: Patient Photo Service

**Files:**
- Create: `backend/app/Services/PatientPhotoService.php`
- Modify later: `backend/app/Http/Controllers/Api/PatientController.php`

- [ ] Move patient photo constants and helpers from the controller into `PatientPhotoService`.
- [ ] Move queued upload, direct upload prepare/finalize, delete, streaming, temporary URL, variant generation, path cache, MIME guessing, and plan-limit enforcement into the service.
- [ ] Preserve scan lifecycle: quarantine, `ProcessUploadedMedia`, approved/rejected handling, variant generation, old-file cleanup.
- [ ] Keep direct-upload fallback behavior for disks without `temporaryUploadUrl()`.

### Task 4: Patient Service

**Files:**
- Create: `backend/app/Services/PatientService.php`
- Modify later: `backend/app/Http/Controllers/Api/PatientController.php`

- [ ] Move tenant-scoped patient lookup, list filtering, lookup endpoint query, create/update/archive/restore/force-delete, overview cache, category sync, patient-id generation, last-visit aggregates, sorting, and pagination helpers into `PatientService`.
- [ ] Preserve audit events and validation messages exactly.
- [ ] Keep force-delete safety checks against appointments, invoices, payments, odontogram entries, and treatments.

### Task 5: Thin Controller

**Files:**
- Modify: `backend/app/Http/Controllers/Api/PatientController.php`

- [ ] Inject `PatientService`, `PatientPhotoService`, and `AuditLogger` only if still needed by controller.
- [ ] Replace business logic with service calls.
- [ ] Wrap returned models/paginators with `PatientResource`.
- [ ] Keep HTTP status codes unchanged: create `201`, archive/force delete `204`, normal writes `200`.

### Task 6: Verification

**Files:**
- Format: touched backend PHP files
- Test: targeted and full backend suite

- [ ] Run Pint on touched files.
- [ ] Run targeted patient/media/tenant tests.
- [ ] Run full backend `artisan test`.
- [ ] If failures appear, fix behavior without changing API response shape.

