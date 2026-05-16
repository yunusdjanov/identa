# Payment Controller Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `PaymentController` into a thin API controller while preserving payment and invoice balance behavior.

**Architecture:** Move list/filter/summary and create/update/delete invoice recalculation rules into `PaymentService`. Move API payload formatting into `PaymentResource`. Keep audit logging in the controller to match the surrounding API pattern.

**Tech Stack:** Laravel controllers, services, API resources, Eloquent transactions, FormRequests, PHPUnit feature tests, Pint.

---

### Task 1: Baseline Verification

**Files:**
- Read: `backend/app/Http/Controllers/Api/PaymentController.php`
- Test: `backend/tests/Feature/PaymentApiTest.php`
- Test: `backend/tests/Feature/ApiIntegrationContractTest.php`

- [ ] Run payment and integration tests before edits.
- [ ] Confirm current behavior passes.

### Task 2: Payment Resource

**Files:**
- Create: `backend/app/Http/Resources/PaymentResource.php`

- [ ] Move the exact payload from `PaymentController::transformPayment()` into the resource.
- [ ] Preserve ids as strings, amounts as floats, `notes` as null, and ISO created timestamp.

### Task 3: Payment Service

**Files:**
- Create: `backend/app/Services/PaymentService.php`

- [ ] Move tenant-scoped list filters, summary calculation, create/update/delete transactions, invoice locking, overpayment validation, status resolution, sorting, pagination, and money normalization into the service.
- [ ] Preserve validation messages and 404 tenant behavior.

### Task 4: Thin Controller

**Files:**
- Modify: `backend/app/Http/Controllers/Api/PaymentController.php`

- [ ] Inject `PaymentService` and keep `AuditLogger`.
- [ ] Replace private business helpers with service/resource calls.
- [ ] Keep HTTP status codes unchanged: create `201`, update `200`, delete `204`.

### Task 5: Verification

**Files:**
- Format: touched backend PHP files
- Test: targeted and full backend suite

- [ ] Run Pint on touched files.
- [ ] Run targeted payment/integration tests.
- [ ] Run full backend `artisan test`.

