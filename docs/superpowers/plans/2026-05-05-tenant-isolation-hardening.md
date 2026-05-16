# Tenant Isolation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize tenant ownership checks and add regression coverage so dentist and assistant users cannot access another clinic's clinical or billing data.

**Architecture:** Keep the current explicit `dentist_id` scoping pattern because it is already used throughout the API and is safer for admin/background flows than a blanket global scope. Add a small tenant-owned model contract/trait, register Laravel policies for critical tenant models, and migrate repeated controller ownership checks to the central helper where it reduces risk without rewriting endpoints.

**Tech Stack:** Laravel 12, Eloquent, Sanctum web auth, PHPUnit feature tests, existing `User::tenantDentistId()` permission model.

---

### Task 1: Regression Tests For Critical IDOR Paths

**Files:**
- Modify: `backend/tests/Feature/PatientApiTest.php`
- Modify: `backend/tests/Feature/OdontogramTreatmentApiTest.php`
- Modify: `backend/tests/Feature/InvoiceApiTest.php`

- [ ] **Step 1: Add failing tests**

Add tests covering:
- assistant cannot show/update another tenant patient by direct ID;
- dentist cannot download another tenant treatment image;
- dentist cannot download another tenant odontogram image;
- dentist cannot update an invoice by switching it to another tenant's patient.

- [ ] **Step 2: Run targeted tests**

Run:
`php artisan test --filter=Tenant`

Expected before implementation: at least policy/central helper tests fail because no tenant-owned contract/policies exist yet.

### Task 2: Tenant-Owned Contract And Trait

**Files:**
- Create: `backend/app/Contracts/TenantOwned.php`
- Create: `backend/app/Models/Concerns/BelongsToTenant.php`
- Modify tenant models: Patient, Appointment, Treatment, TreatmentImage, OdontogramEntry, OdontogramEntryImage, Invoice, Payment, PatientCategory, AuditLog.

- [ ] **Step 1: Write unit tests for tenant ownership helpers**

Add tests proving `belongsToTenant()` allows dentist owner and assistant owner, rejects other tenants and admin for app-owned data.

- [ ] **Step 2: Implement contract/trait**

The trait reads `dentist_id`, provides `scopeForTenant($query, User|int $tenant)`, `tenantId()`, and `belongsToTenant(User $user)`.

### Task 3: Policies

**Files:**
- Create: `backend/app/Policies/TenantOwnedPolicy.php`
- Create simple model policies extending/using it for critical models.
- Modify: `backend/app/Providers/AppServiceProvider.php`

- [ ] **Step 1: Write policy tests**

Test `view`, `update`, `delete`, and `download` style checks for dentist, assistant, admin, and foreign dentist.

- [ ] **Step 2: Register policies**

Register policies for Patient, Appointment, Treatment, TreatmentImage, OdontogramEntry, OdontogramEntryImage, Invoice, Payment.

### Task 4: Controller Integration

**Files:**
- Modify API controllers where helper methods currently duplicate tenant checks.

- [ ] **Step 1: Replace repeated find-owned helpers carefully**

Keep SQL `where('dentist_id', ...)` filters for performance and index usage. Add policy authorization after fetching where useful.

- [ ] **Step 2: Verify no unscoped `findOrFail` remains on tenant models**

Search controllers for direct tenant model lookup and either scope it or document why it is admin/global.

### Task 5: Verification

Run:
- `php artisan test --filter=Tenant`
- `php artisan test`
- Frontend tests are not required unless API response shapes change.

Expected final result: all backend tests pass; cross-tenant direct ID access remains 404/403 depending on route behavior.
