# Medical Upload Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add quarantine, antivirus scanning, image sanitization, and approved-only access to medical media uploads.

**Architecture:** Keep existing Laravel controllers and models, but route all media through a central processing job and scanner abstraction. Existing plan limits and permission middleware remain authoritative.

**Tech Stack:** Laravel, Sanctum, queue jobs, private filesystem/R2 disks, GD image processing, ClamAV adapter.

---

### Task 1: Add media scan schema

**Files:**
- Create: `backend/database/migrations/2026_05_05_120000_add_scan_status_to_media_tables.php`
- Modify: `backend/app/Models/Patient.php`
- Modify: `backend/app/Models/TreatmentImage.php`
- Modify: `backend/app/Models/OdontogramEntryImage.php`

- [ ] Add nullable scan columns and default `approved` for existing rows.
- [ ] Add fillable and casts for scan metadata.
- [ ] Run backend tests.

### Task 2: Add scanner and sanitizer foundation

**Files:**
- Create: `backend/app/Services/Media/AntivirusScanner.php`
- Create: `backend/app/Services/Media/ScanResult.php`
- Create: `backend/app/Services/Media/NullAntivirusScanner.php`
- Create: `backend/app/Services/Media/ClamAvAntivirusScanner.php`
- Create: `backend/config/media-security.php`
- Modify: `backend/app/Providers/AppServiceProvider.php`
- Modify: `backend/app/Services/ImageCompressionService.php`

- [ ] Write failing scanner/sanitizer tests.
- [ ] Bind scanner by config.
- [ ] Make image optimization fail closed when decoding fails.
- [ ] Run targeted tests.

### Task 3: Add processing job

**Files:**
- Create: `backend/app/Jobs/ProcessUploadedMedia.php`
- Modify: media models as needed.
- Test: `backend/tests/Feature/MediaUploadSecurityTest.php`

- [ ] Write failing tests for pending media not downloadable and rejected scan not visible.
- [ ] Implement job to scan, sanitize, approve, reject, and log.
- [ ] Run targeted tests.

### Task 4: Wire controllers to quarantine

**Files:**
- Modify: `backend/app/Http/Controllers/Api/PatientController.php`
- Modify: `backend/app/Http/Controllers/Api/PatientTreatmentController.php`
- Modify: `backend/app/Http/Controllers/Api/PatientOdontogramController.php`
- Modify: `backend/app/Support/TreatmentImageDirectUploadService.php`

- [ ] Store uploads under quarantine paths.
- [ ] Return pending media state.
- [ ] Serve only approved media.
- [ ] Preserve existing authorization and plan checks.

### Task 5: Verify

**Commands:**
- `npm run test:backend`
- `npm run lint`
- `npm run build`

- [ ] Document required environment variables.
- [ ] Document deployment requirements for private ClamAV.
