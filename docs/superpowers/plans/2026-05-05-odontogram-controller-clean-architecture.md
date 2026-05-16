# Odontogram Controller Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `PatientOdontogramController` into services and API resources while preserving all existing odontogram API behavior.

**Architecture:** Follow the newly introduced treatment pattern. Controller stays as request/response coordinator; `OdontogramEntryService` owns tenant-scoped entry CRUD/list/summary; `OdontogramImageService` owns image upload, direct upload, streaming, variants, and delete; resources own exact JSON output.

**Tech Stack:** Laravel 12, Eloquent, FormRequest validation, Sanctum auth, queued media jobs, PHPUnit feature tests, Laravel Pint.

---

## File Structure

- Create `backend/app/Services/OdontogramEntryService.php`: tenant lookup, index/store/update/delete/summary logic, audit logging.
- Create `backend/app/Services/OdontogramImageService.php`: upload, direct upload prepare/finalize, stream, delete, URL and variant helpers.
- Create `backend/app/Http/Resources/OdontogramEntryResource.php`: exact current entry JSON shape.
- Create `backend/app/Http/Resources/OdontogramImageResource.php`: exact current image JSON shape.
- Modify `backend/app/Http/Controllers/Api/PatientOdontogramController.php`: delegate to services/resources.

## Task 1: Baseline

- [ ] Run `php artisan test --filter='OdontogramTreatmentApiTest|MediaUploadSecurityTest|StrictTenantIsolationTest'`.
- [ ] Expected: pass before refactor.

## Task 2: Resources

- [ ] Add `OdontogramEntryResource` and `OdontogramImageResource`.
- [ ] Replace controller `transformOdontogramEntry()` calls with resource resolution.
- [ ] Run `php artisan test --filter='OdontogramTreatmentApiTest|MediaUploadSecurityTest'`.

## Task 3: Image Service

- [ ] Move image payload, URL, variant readiness, stream, delete, direct upload cache, prepare, and finalize logic into `OdontogramImageService`.
- [ ] Keep response keys and scan/pending behavior unchanged.
- [ ] Run `php artisan test --filter='OdontogramTreatmentApiTest|MediaUploadSecurityTest|StrictTenantIsolationTest'`.

## Task 4: Entry Service

- [ ] Move tenant lookup, index, store, update, delete, summary, pagination, sorting, and audit logging into `OdontogramEntryService`.
- [ ] Keep controller route method signatures unchanged.
- [ ] Run `php artisan test --filter='OdontogramTreatmentApiTest|StrictTenantIsolationTest'`.

## Task 5: Final Verification

- [ ] Run Pint on touched odontogram files.
- [ ] Run full `php artisan test`.
- [ ] Report changed files, behavior summary, verification, and remaining risks.
