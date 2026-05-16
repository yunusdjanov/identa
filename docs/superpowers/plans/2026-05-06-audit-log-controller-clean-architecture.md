# Audit Log Controller Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `AuditLogController` into a thin read-only API controller while preserving tenant scoping and hidden event filtering.

**Architecture:** Move list filtering, tenant resolution, hidden event filtering, sorting, and pagination into `AuditLogService`. Move response payload formatting into `AuditLogResource`. Keep endpoint response shape unchanged.

**Tech Stack:** Laravel controllers, services, API resources, Eloquent, PHPUnit feature tests, Pint.

---

### Task 1: Baseline Verification

**Files:**
- Read: `backend/app/Http/Controllers/Api/AuditLogController.php`
- Test: `backend/tests/Feature/AuditLogApiTest.php`
- Test: `backend/tests/Feature/TenantIsolationPolicyTest.php`

- [ ] Run audit log and tenant tests before edits.
- [ ] Confirm current behavior passes.

### Task 2: Audit Log Resource

**Files:**
- Create: `backend/app/Http/Resources/AuditLogResource.php`

- [ ] Move the exact payload from `AuditLogController::transformEntry()` into the resource.
- [ ] Preserve actor nested shape, metadata, IP/user-agent, and ISO timestamp.

### Task 3: Audit Log Service

**Files:**
- Create: `backend/app/Services/AuditLogService.php`

- [ ] Move tenant-scoped query, hidden event filtering, filters, search, sorting, and pagination into the service.
- [ ] Preserve hidden event type list exactly.

### Task 4: Thin Controller

**Files:**
- Modify: `backend/app/Http/Controllers/Api/AuditLogController.php`

- [ ] Inject `AuditLogService`.
- [ ] Replace private helpers with service/resource calls.
- [ ] Keep pagination meta unchanged.

### Task 5: Verification

**Files:**
- Format: touched backend PHP files
- Test: targeted and full backend suite

- [ ] Run Pint on touched files.
- [ ] Run targeted audit log tests.
- [ ] Run full backend `artisan test`.

