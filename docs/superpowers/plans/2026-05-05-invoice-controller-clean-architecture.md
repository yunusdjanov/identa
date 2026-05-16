# Invoice Controller Clean Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `InvoiceController` into a thin API controller while preserving invoice behavior, PDF output, tenant checks, and response contracts.

**Architecture:** Move invoice query/create/update/delete rules into `InvoiceService`, PDF rendering/localization helpers into `InvoicePdfService`, and API payload formatting into `InvoiceResource`. The controller will only call services and return JSON/PDF responses.

**Tech Stack:** Laravel controllers, services, API resources, Eloquent, FormRequests, Dompdf, PHPUnit feature tests, Pint.

---

### Task 1: Baseline Verification

**Files:**
- Read: `backend/app/Http/Controllers/Api/InvoiceController.php`
- Test: `backend/tests/Feature/InvoiceApiTest.php`
- Test: `backend/tests/Feature/StrictTenantIsolationTest.php`

- [ ] Run invoice and tenant tests before edits.
- [ ] Confirm current behavior passes.

### Task 2: Invoice Resource

**Files:**
- Create: `backend/app/Http/Resources/InvoiceResource.php`

- [ ] Move the exact payload from `InvoiceController::transformInvoice()` into the resource.
- [ ] Preserve optional item inclusion for list vs detail responses.
- [ ] Keep patient fields, money casts, status, and timestamps unchanged.

### Task 3: Invoice PDF Service

**Files:**
- Create: `backend/app/Services/InvoicePdfService.php`

- [ ] Move Dompdf setup, PDF view data building, translation helpers, date formatting, status/payment translation, money formatting, and humanization helpers into the service.
- [ ] Keep generated PDF bytes, template path, paper size, and localized output unchanged.

### Task 4: Invoice Service

**Files:**
- Create: `backend/app/Services/InvoiceService.php`

- [ ] Move tenant-scoped invoice lookup, listing filters, summary calculations, create/update/delete rules, item normalization, odontogram ownership validation, status resolution, money normalization, and invoice number generation into the service.
- [ ] Preserve validation error messages and 404 tenant behavior.

### Task 5: Thin Controller

**Files:**
- Modify: `backend/app/Http/Controllers/Api/InvoiceController.php`

- [ ] Inject `InvoiceService` and `InvoicePdfService`.
- [ ] Replace private business helpers with service/resource calls.
- [ ] Keep HTTP status codes and headers unchanged.

### Task 6: Verification

**Files:**
- Format: touched backend PHP files
- Test: targeted and full backend suite

- [ ] Run Pint on touched files.
- [ ] Run targeted invoice and tenant tests.
- [ ] Run full backend `artisan test`.

