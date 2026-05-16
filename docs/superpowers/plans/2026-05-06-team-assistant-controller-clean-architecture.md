# Team Assistant Controller Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `TeamAssistantController` into a thin API controller while preserving assistant lifecycle, permission normalization, and staff-limit enforcement.

**Architecture:** Move list/summary, tenant-scoped assistant lookup, create/update/status/password/delete logic, staff-limit locking, pagination, and permission sanitization into `TeamAssistantService`. Move response payload formatting into `AssistantResource`. Keep audit logging in the controller so each API action remains explicit.

**Tech Stack:** Laravel controllers, services, API resources, Eloquent transactions, FormRequests, staff plan limit service, PHPUnit feature tests, Pint.

---

### Task 1: Baseline Verification

**Files:**
- Read: `backend/app/Http/Controllers/Api/TeamAssistantController.php`
- Test: `backend/tests/Feature/TeamAssistantApiTest.php`
- Test: `backend/tests/Feature/AssistantTenantAccessTest.php`

- [ ] Run team assistant and assistant tenant tests before edits.
- [ ] Confirm current behavior passes.

### Task 2: Assistant Resource

**Files:**
- Create: `backend/app/Http/Resources/AssistantResource.php`

- [ ] Move the exact payload from `TeamAssistantController::transformAssistant()` into the resource.
- [ ] Preserve permission normalization, timestamp formats, account status, and password flag.

### Task 3: Team Assistant Service

**Files:**
- Create: `backend/app/Services/TeamAssistantService.php`

- [ ] Move list filters and summary calculation into the service.
- [ ] Move create/update/status/reset-password/delete into the service.
- [ ] Preserve staff-limit lock/check behavior for create and reactivation.
- [ ] Preserve deleted assistant idempotent delete behavior and tenant 404 behavior.

### Task 4: Thin Controller

**Files:**
- Modify: `backend/app/Http/Controllers/Api/TeamAssistantController.php`

- [ ] Inject `TeamAssistantService` and keep `AuditLogger`.
- [ ] Replace private helpers with service/resource calls.
- [ ] Keep HTTP status codes unchanged.

### Task 5: Verification

**Files:**
- Format: touched backend PHP files
- Test: targeted and full backend suite

- [ ] Run Pint on touched files.
- [ ] Run targeted team assistant tests.
- [ ] Run full backend `artisan test`.

