# Auth Controller Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `AuthController` into a thinner API controller while preserving public registration, Google auth, login portal separation, session behavior, and user response shape.

**Architecture:** Move registration, Google login/register, password login, account activity checks, portal mismatch checks, current-session logout helper, and change-password logic into `AuthService`. Move authenticated user payload formatting into `UserResource`. Keep password broker endpoints in the controller unless they grow further.

**Tech Stack:** Laravel controllers, services, API resources, session auth/Sanctum, Google identity service, subscription service, password broker, PHPUnit feature tests, Pint.

---

### Task 1: Baseline Verification

**Files:**
- Read: `backend/app/Http/Controllers/Api/AuthController.php`
- Test: `backend/tests/Feature/AuthSessionTest.php`
- Test: `backend/tests/Feature/AdminAuthorizationTest.php`

- [ ] Run auth/admin authorization tests before edits.
- [ ] Confirm current behavior passes.

### Task 2: User Resource

**Files:**
- Create: `backend/app/Http/Resources/UserResource.php`

- [ ] Move exact payload from `AuthController::transformUser()` into the resource.
- [ ] Preserve subscription summary, assistant permissions normalization, password presence, provider fields, and timestamps.

### Task 3: Auth Service

**Files:**
- Create: `backend/app/Services/AuthService.php`

- [ ] Move email registration and trial creation into the service.
- [ ] Move Google auth register/login/link behavior into the service.
- [ ] Move login attempt, portal mismatch rejection, inactive checks, assistant owner checks, last-login update, and session logout helper into the service.
- [ ] Move change-password validation support and update logic into the service.
- [ ] Preserve validation messages, audit events, session regeneration, and remember-me behavior.

### Task 4: Thin Controller

**Files:**
- Modify: `backend/app/Http/Controllers/Api/AuthController.php`

- [ ] Inject `AuthService` and `AuditLogger`.
- [ ] Replace register/google/login/change-password internals with service calls.
- [ ] Keep logout, forgot-password, and reset-password response behavior unchanged.
- [ ] Use `UserResource` for all user payload responses.

### Task 5: Verification

**Files:**
- Format: touched backend PHP files
- Test: targeted and full backend suite

- [ ] Run Pint on touched files.
- [ ] Run targeted auth/admin tests.
- [ ] Run full backend `artisan test`.

