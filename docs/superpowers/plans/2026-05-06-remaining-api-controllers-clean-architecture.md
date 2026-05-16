# Remaining API Controllers Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish thin-controller refactors for the remaining small API controllers while preserving current behavior and response contracts.

**Architecture:** Add focused services for billing read helpers, dashboard snapshot aggregation, landing settings/leads, patient categories, and profile settings. Add API resources for shared payloads. Keep controllers limited to validation, service calls, audit logging where appropriate, and response construction.

**Tech Stack:** Laravel controllers, services, API resources, Eloquent, FormRequests, PHPUnit feature tests, Pint.

---

### Task 1: Baseline Verification

**Files:**
- Read: `backend/app/Http/Controllers/Api/BillingController.php`
- Read: `backend/app/Http/Controllers/Api/DashboardController.php`
- Read: `backend/app/Http/Controllers/Api/LandingController.php`
- Read: `backend/app/Http/Controllers/Api/PatientCategoryController.php`
- Read: `backend/app/Http/Controllers/Api/SettingsProfileController.php`

- [ ] Run billing/dashboard/category/profile targeted tests before edits.
- [ ] Confirm current behavior passes.

### Task 2: Billing Resources and Service Methods

**Files:**
- Create: `backend/app/Http/Resources/PlanResource.php`
- Create: `backend/app/Http/Resources/BillingPaymentResource.php`
- Modify: `backend/app/Services/BillingService.php`
- Modify: `backend/app/Http/Controllers/Api/BillingController.php`

- [ ] Move plan and billing payment payloads into resources.
- [ ] Move active plan listing, current subscription owner lookup, payment history listing, and cancel helper into `BillingService`.
- [ ] Keep checkout/webhook behavior unchanged.

### Task 3: Dashboard Service

**Files:**
- Create: `backend/app/Services/DashboardService.php`
- Modify: `backend/app/Http/Controllers/Api/DashboardController.php`

- [ ] Move permission-aware cached dashboard aggregation into service.
- [ ] Preserve cache key shape, appointment payload, financial totals, and duration calculation.

### Task 4: Landing Service and Resources

**Files:**
- Create: `backend/app/Services/LandingService.php`
- Create: `backend/app/Http/Resources/LandingSettingsResource.php`
- Create: `backend/app/Http/Resources/LeadRequestResource.php`
- Modify: `backend/app/Http/Controllers/Api/LandingController.php`

- [ ] Move settings composition and lead creation into service.
- [ ] Preserve pricing fallback behavior and lead response payload.

### Task 5: Category and Profile Services

**Files:**
- Create: `backend/app/Services/PatientCategoryService.php`
- Create: `backend/app/Services/ProfileSettingsService.php`
- Create: `backend/app/Http/Resources/PatientCategoryResource.php`
- Create: `backend/app/Http/Resources/ProfileResource.php`
- Modify: `backend/app/Http/Controllers/Api/PatientCategoryController.php`
- Modify: `backend/app/Http/Controllers/Api/SettingsProfileController.php`

- [ ] Move category CRUD and tenant lookup into service.
- [ ] Move profile update allow-listing and working-hours validation into service.
- [ ] Preserve response payloads and validation messages.

### Task 6: Verification

**Files:**
- Format: all touched backend PHP files
- Test: targeted and full backend suite

- [ ] Run Pint on touched files.
- [ ] Run targeted billing/dashboard/category/profile tests.
- [ ] Run full backend `artisan test`.

