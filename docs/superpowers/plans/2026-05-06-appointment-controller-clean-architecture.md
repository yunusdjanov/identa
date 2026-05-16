# Appointment Controller Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `AppointmentController` into a thin API controller while preserving schedule conflict and status behavior.

**Architecture:** Move listing, lookup, tenant lookup, create/update/delete, overlap checks, immutable status checks, sorting, and pagination into `AppointmentService`. Move API payload formatting into `AppointmentResource`. Keep endpoint paths, status codes, validation requests, and response shapes unchanged.

**Tech Stack:** Laravel controllers, services, API resources, Eloquent transactions, FormRequests, PHPUnit feature tests, Pint.

---

### Task 1: Baseline Verification

**Files:**
- Read: `backend/app/Http/Controllers/Api/AppointmentController.php`
- Test: `backend/tests/Feature/AppointmentApiTest.php`
- Test: `backend/tests/Feature/ApiIntegrationContractTest.php`

- [ ] Run appointment and integration tests before edits.
- [ ] Confirm current behavior passes.

### Task 2: Appointment Resource

**Files:**
- Create: `backend/app/Http/Resources/AppointmentResource.php`

- [ ] Move the exact payload from `AppointmentController::transformAppointment()` into the resource.
- [ ] Preserve ids as strings, patient name, time trimming to `HH:MM`, status, and notes.

### Task 3: Appointment Service

**Files:**
- Create: `backend/app/Services/AppointmentService.php`

- [ ] Move list and lookup query logic into the service.
- [ ] Move create/update/delete and tenant-scoped lookup into the service.
- [ ] Preserve conflict rules: cancelled and no-show appointments do not block slots.
- [ ] Preserve immutable status rules: completed, cancelled, and no-show appointments cannot be edited.
- [ ] Preserve validation messages and 404 tenant behavior.

### Task 4: Thin Controller

**Files:**
- Modify: `backend/app/Http/Controllers/Api/AppointmentController.php`

- [ ] Inject `AppointmentService`.
- [ ] Replace private helpers with service/resource calls.
- [ ] Keep HTTP status codes unchanged: create `201`, update `200`, delete `204`.

### Task 5: Verification

**Files:**
- Format: touched backend PHP files
- Test: targeted and full backend suite

- [ ] Run Pint on touched files.
- [ ] Run targeted appointment/integration tests.
- [ ] Run full backend `artisan test`.

