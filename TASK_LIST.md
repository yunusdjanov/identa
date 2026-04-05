# DentalFlow MVP - Development Tasks

## Phase 2 Tracking Snapshot (2026-02-15)
- [x] Real backend integration is active for core frontend routes
- [x] Local E2E execution pipeline stabilized (`npm run test:e2e` green)
- [x] Critical E2E mutation coverage in place for dentist/admin journeys
- [x] Local full-gate command matrix and one-command verifier added (`npm run quality:all`)
- [x] Restore full dentist mutation assertions after session/CSRF hardening
- [x] Complete remaining backend/API integration tests
- [x] M6 security checklist documented
- [x] M6 observability baseline documented
- [x] M6 backup and rollback strategy documented
- [x] M6 deployment playbook draft documented
- [x] Phase 2 go/no-go review drafted (conditional production decision)
- [x] Post-review bugfix pack: auth/session persistence, appointment unauthorized, hydration mismatch, and startup reliability
- [x] Appointment UX fix: slot click now prefills date/time in schedule modal
- [x] Appointment modal UX: full-width patient/duration controls + patient search input
- [x] Appointment modal UX refinement: replaced basic patient filter with select2-like searchable combobox (single control)
- [x] Appointment modal patient picker: search supports name + phone
- [x] Appointment modal picker UX: hide patient ID under name and open options only on click
- [x] Appointments day-view drag and drop rescheduling (move to empty slot)
- [x] Appointments management: edit flow + hard delete with confirmation
- [x] Appointments rule: completed/cancelled are locked for edit; delete still allowed
- [x] Edit appointment modal: explicit status selector for scheduled/no_show workflows
- [x] Appointments UX refinement: status changed inline on card; edit/delete switched to icon-only actions
- [x] Appointment card control polish: removed duplicate status badge and reduced destructive visual weight
- [x] Appointment controls reverted by UX request: text Edit/Delete + status moved back to Edit modal
- [x] Appointment visual mapping: full card color now reflects appointment status
- [x] Week view UX refinement: day cells show first appointment + `N more`, date-click opens exact Day view, and quick overflow preview dropdown added
- [x] UX polish: replaced plain loading text with skeleton states on Dashboard, Patients, Appointments, and Payments pages
- [x] UX polish extended: added skeleton loading states for Settings, Admin Dashboard, and Admin Settings pages
- [x] Patients module enhancement: row numbering, short patient ID format (`PT-####AA`), deterministic newest-first sorting, last-visit column, and 6-month inactive filter toggle
- [x] Patients UX/flow pass: styled `View Details`, backend-driven `last_visit_at`, `Needs Follow-up` badge, and one-click `Schedule` action for inactive mode (with patient prefill in appointment modal)
- [x] Patients regression coverage: added tests for inactivity filtering, follow-up status rendering, and quick-schedule/detail routing actions
- [x] Patient detail page fixes: replaced text loader with full skeleton and restored working `Edit Patient` flow (dialog + API update mutation)
- [x] Odontogram workflow refinement: removed treatment-surface dependency from patient flows, improved tooth history discoverability, and added optional invoice creation during condition entry (with regression tests)
- [x] Odontogram/patient UX consistency pass: added odontogram-page skeleton loading, strengthened patient-detail condition preview with color/history context, and aligned landing-page copy with condition-first workflow
- [x] Patient detail + odontogram billing pass: fixed unreadable condition text colors, added paid-at-creation support in odontogram billing flow (auto-record payment), and added dedicated Billing & Payments management block on patient detail page
- [x] Odontogram billing UX enhancement: added explicit payment method selection (`cash/card/bank_transfer`) for paid-now flow instead of fixed cash
- [x] Patient detail billing manager UX: replaced redirect-based `Manage Billing` with in-page patient-specific billing management (full invoice list + direct record-payment actions)
- [x] Patient detail billing manager UX iteration: migrated in-page manager to right-side sheet panel for better focus and table usability while preserving patient context
- [x] Patient detail billing UX finalization: removed sheet manager and added direct `Record Payment` actions for `unpaid` and `partially_paid` invoices in the patient billing block
- [x] Patient billing UI refinement: removed `Recent Payments` panel and redesigned `Recent Invoices` into action cards with `View` and contextual `Record Payment` actions
- [x] Patient billing modal workflow: changed `New Invoice`, `Payment History`, and `View` to modal-based flows and added per-invoice `Download` action (print-to-PDF)
- [x] Invoice document workflow hardening: switched to true one-click backend PDF download and aligned invoice `View` modal with per-invoice payment history
- [x] Invoice PDF UX redesign: upgraded backend-generated invoice to structured, readable layout (header, sections, tables, totals, payment history, notes)
- [x] Billing management controls: added invoice edit/delete actions and payment-history edit/delete actions with real backend mutation logic and balance/status recalculation
- [x] Billing action density UX: collapsed invoice `Edit/Delete` into a single `More` actions menu on cards and invoice view modal for cleaner interaction hierarchy
- [x] Billing action compactness pass: switched `More` triggers to compact icon-only controls and applied the dropdown action pattern to payment-history rows
- [x] Invoice modal action readability pass: changed icon-only `Download/Edit/Delete` to labeled buttons while keeping `Record Payment` as first-row primary action
- [x] Main payments page parity: added invoice `view/download/edit/delete`, payment-history `edit/delete`, invoice detail modal with payment actions, and full mutation wiring on `/payments`
- [x] Billing UX simplification: removed standalone `Payment History` buttons/modals from patient detail and main payments page, keeping payment management in invoice-context views
- [x] Payments page refinement: restored `New Invoice` action and updated invoices table identity columns to `#`, `Invoice Number`, `Name`, and `Phone`
- [x] Odontogram visual experiment: replaced rectangular tooth blocks with realistic SVG tooth silhouettes (type-based anatomy + upper/lower orientation) while preserving condition/history logic
- [x] Patients categorization system: added dentist-owned patient categories (backend many-to-many), category CRUD management UI, single-select category assignment on add/edit patient forms, category badges in list, and category-based patient filtering
- [x] Patient detail performance pass: replaced eager all-record appointment/invoice/payment fetches with server-driven summary + preview queries and on-demand invoice payment-history loading
- [x] Invoice API summary contract hardened: summary now honors active filters and includes `total_amount` for accurate frontend billing totals
- [x] Patient detail odontogram scalability pass: replaced full odontogram-history fetch with dedicated summary endpoint (`/patients/{id}/odontogram/summary`) and lightweight preview payload
- [x] Admin dashboard scalability pass: removed full dentist account aggregation by switching to server-side search/pagination plus API summary metrics (`total_count`, `active_count`, `new_registrations_7d`)
- [x] Security headers hardening baseline: added global API security-header middleware (CSP/frame/content-type/referrer/permissions) with configurable HSTS for secure requests and feature-test coverage
- [x] Dependency audit gate baseline: added `quality:security` command (`npm audit` + `composer audit`) and documented it in QA command matrix
- [x] Dependency audit remediation pass: applied lockfile updates via `npm audit fix`; `npm run quality:security` now reports zero advisories (frontend + backend)
- [x] CI security-gate wiring: added GitHub Actions workflow (`.github/workflows/ci-quality-security.yml`) for frontend quality, backend tests, and dependency audit checks on push/PR
- [x] Secrets hardening baseline: added production secret validator + runtime fail-fast (`SECRETS_ENFORCE_RUNTIME`) + deployment preflight command (`php artisan security:check-secrets`) with automated tests and release docs
- [x] Error tracking baseline: integrated Sentry provider into exception pipeline with request/user context propagation and payload scrubbing, plus unit coverage and release documentation
- [x] Edge/TLS runtime policy baseline: added production runtime policy validator (`APP_URL=https`, secure cookies, HSTS, Sanctum stateful domains, trusted proxies) + preflight command (`security:check-runtime --production`) + proxy trust bootstrap wiring
- [x] Release preflight orchestration: added one-command preflight scripts (`release:preflight`, `release:preflight:production`) and validated passing production-mode run with explicit production env overrides
- [x] P1 test-hygiene stabilization: removed noisy frontend `act(...)` warning source from appointment dialog tests and re-verified `quality:frontend` gate
- [x] P1 accessibility baseline (critical flows): added keyboard row navigation, radio-group keyboard semantics, and missing ARIA labeling/state semantics across appointments/patients/payments
- [x] P1 accessibility manual review closure: validated primary workflows against WCAG 2.1 AA critical/major issues and documented evidence (`docs/qa/A11Y_MANUAL_REVIEW_2026-02-28.md`)
- [x] P1 UI-state consistency pass: standardized empty/filter-reset states for patients/payments and confirmed loading/error/retry coverage across primary pages
- [x] P1 coverage expansion: added focused UI tests for invoice/payment delete flows and category CRUD/assignment edge paths (`app/payments/page.test.tsx`, `components/patients/manage-categories-dialog.test.tsx`, `components/patients/add-patient-dialog.test.tsx`)
- [x] P2 architecture slice: introduced shared confirmation dialog primitive (`components/ui/confirm-action-dialog.tsx`) and replaced duplicated delete-confirm patterns in appointments/payments/patient-detail/category-management flows
- [x] P2 contract/type consolidation slice: added shared billing mappers/types (`lib/billing.ts`) and removed duplicate invoice-shape mapping logic from payments/patient-detail/payment-dialog flows
- [x] P2 coupling review: documented reduced + remaining cross-module hotspots and next extraction candidates (`docs/architecture/COUPLING_HOTSPOTS_2026-02-28.md`)
- [x] P2 performance slice: moved patient-detail invoice ordering server-side, narrowed billing query invalidation scope, and tuned short query stale windows to reduce refetch/render churn; documented outcomes/backlog (`docs/qa/PERFORMANCE_PASS_2026-02-28.md`)
- [x] P2 performance slice: switched patient-detail invoice payment-history modal to incremental loading (20/page + `Load more`) instead of fixed large fetch to reduce initial modal latency on large histories
- [x] P2 performance verification: added repeatable local performance scripts (`npm run perf:seed`, `npm run perf:snapshot`) and validated responsiveness under larger seeded dataset (300 patients, 1211 appointments, 253 invoices, 498 payments)
- [x] Advanced calendar rules slice (phase-start): blocked past appointment slots in backend + frontend validation, improved overlap safety for drag/drop by checking full moved time range, and updated day-view rendering so long appointments visibly occupy all covered slots
- [x] Appointment prefill reliability fix: scheduling from patient contexts now preserves URL-based `patientId` prefill behavior with regression coverage in appointment dialog tests
- [x] Dashboard appointments UX refinement: show only 3 upcoming appointments on dashboard, add `Show all today (N)` action to `/appointments`, and cover behavior with focused dashboard tests (`app/dashboard/page.test.tsx`)
- [x] Input-hardening pass (contact + identity forms): added shared phone mask/normalization and email/phone live validation, enforced consistent max-length limits, and surfaced inline field feedback before submit across patient/auth/settings/admin/category forms

## Phase 1: Foundation & Setup (Frontend-First Approach)
- [x] Project initialization
  - [x] Create project directory structure
  - [x] Initialize Next.js 14 frontend
  - [x] Setup Git repository
  - [x] Configure environment files
  - [ ] Backend deferred (will add after frontend is complete)
- [x] Frontend dependencies
  - [x] Install TanStack Query, axios, date-fns, zustand
  - [x] Setup shadcn/ui components
  - [x] Configure mock data layer
  - [x] Create navigation layout
  - [x] Build dashboard page

## Phase 2: Lightweight Tenancy
- [ ] Tenant isolation implementation
  - [ ] Create TenantScope global scope
  - [ ] Apply to all tenant-scoped models
  - [ ] Tenant middleware
  - [ ] Tenant context management
- [ ] Leak prevention tests
  - [ ] Test: Cannot query other tenant's patients
  - [ ] Test: Cannot update other tenant's appointments
  - [ ] Test: Cannot view other tenant's invoices
  - [ ] Test: API endpoints reject cross-tenant access
  - [ ] Test: Direct Eloquent queries are scoped

## Phase 3: Patient Management
- [/] Database schema (using mock data for now)
  - [x] Patient types defined
  - [x] Mock patient data created
- [x] Frontend UI
  - [x] Patients list page
  - [x] Patient search/filter
  - [x] Add patient form
  - [x] Patient detail page
  - [ ] Edit patient form (can reuse add form)

## Phase 4: Odontogram (Critical - Most Complex Feature)
- [x] Database schema (using mock data)
  - [x] Odontogram types defined
  - [x] Treatment types defined
  - [x] Mock odontogram data created
- [x] Frontend UI (Most Complex)
  - [x] Design tooth chart layout (1-32 numbering)
  - [x] Simple rectangular tooth visualization
  - [x] Color coding for conditions
  - [x] Click tooth → open modal
  - [x] Tooth detail modal with history
  - [x] Add/edit condition form
  - [x] Mobile/tablet responsive design (simple grid layout)
  - [x] Touch-friendly interactions

## Phase 5: Appointment Scheduling
- [x] Database schema (using mock data)
  - [x] Appointment types defined
  - [x] Mock appointment data created
- [x] Frontend UI
  - [x] Calendar component (day view)
  - [x] Calendar component (week view)
  - [x] Time slot grid (30-min intervals)
  - [x] New appointment modal
  - [x] Appointment detail display
  - [x] Date navigation

## Phase 6: Payment & Debt Tracking
- [x] Database schema (using mock data)
  - [x] Invoice and payment types defined
  - [x] Mock invoice and payment data created
- [x] Frontend UI
  - [x] Outstanding invoices list
  - [x] Record payment modal
  - [x] Payment summary cards
  - [x] Invoice table with search/filter

## Phase 7: Simple Dashboard
- [x] Backend API (using mock data)
  - [x] Dashboard stats mock data
- [x] Frontend UI
  - [x] Revenue this month card
  - [x] Outstanding debt total card
  - [x] Today's appointments list
  - [x] Quick action buttons

## Phase 8: Super Admin Panel
- [x] Admin authentication
  - [x] Separate admin login route (`/admin/login`)
  - [x] Admin role/permission system (mock)
  - [x] Admin logout functionality
- [x] Admin settings page
  - [x] Admin profile management (name, email)
  - [x] Password change functionality
- [x] Dentist account management UI
  - [x] List all dentist accounts (table view)
  - [x] Search/filter dentists
  - [x] Block/unblock dentist account
  - [x] Reset password action
  - [x] Soft delete dentist account
  - [x] Manual dentist account creation (with modal form)
- [x] Admin dashboard
  - [x] Total dentists count
  - [x] Active dentists count
  - [x] New registrations (last 7 days)


## Phase 9-11: Backend Integration (Deferred)
- [ ] Backend setup (Laravel + PostgreSQL)
- [ ] Authentication system
- [ ] Tenant isolation
- [ ] API endpoints for all features
- [ ] Testing and deployment

## Phase 12: Patient UX/Data Refinement
- [x] Add optional second phone field (`secondary_phone`) with real DB persistence
- [x] Include second phone in patient API/search and detail page rendering
- [x] Convert patient gender input to icon-based male/female radio controls in add/edit dialogs
- [x] Ensure category selects in add/edit dialogs use full-width styled select
- [x] Replace category delete browser confirm with app-styled confirmation dialog

## Current Sprint Updates (2026-03-10)
- [ ] Demo polish lane kickoff (2026-03-11):
  - [ ] Execute P0 board in `docs/qa/EXECUTION_BOARD.md` (localization integrity, hydration/header stability, visual defect cleanup)
  - [ ] Verify core demo route manually: Login -> Dashboard -> Patients -> Appointments -> Payments -> Staff
  - [ ] Re-run frontend quality gate after fixes (`npm run lint`, `npm test -- --run`, `npm run build`)
- [x] P0.1 stability fix: made payments URL-filter initialization hydration-safe (client-gated URL parsing + stable initial filter state)
- [x] P0.2 stability fix: guarded payments invoice-detail query to never return `undefined` and removed React Query runtime warning
- [x] P0.3 validation parity pass:
  - [x] Frontend text validator now enforces configured `min` length with localized messages
  - [x] Backend request validation aligned for critical forms (auth, patient, appointment, invoice, profile, admin dentist, patient categories)
  - [x] Amount min parity aligned to `0.01` across invoice/payment inputs and checks
  - [x] Added focused frontend/backend regression tests for new validation constraints
- [x] P0.4 migration/schema reliability pass:
  - [x] Added idempotent backend schema sync command (`npm run db:migrate`)
  - [x] Wired backend startup script to auto-apply pending migrations before serve
  - [x] Added startup preflight mode (`run-backend.ps1 -SkipServe`) and migration-runbook updates
- [x] P0.5 appointment scheduling reliability pass:
  - [x] URL-driven appointment modal opening now tracks dismissal per URL signature (`action` + `patientId`) to keep patient-context prefill behavior stable
  - [x] Added regression test that validates `/appointments?action=new&patientId=<id>` reaches the add-appointment dialog as prefill props
  - [x] Added regression test for day-view long-appointment continuation occupancy rendering across covered slots
- [x] Stable baseline checkpoint (no feature changes):
  - [x] Full local quality gate passed (`npm run lint`, `npm test -- --run`, `npm run build`, `php artisan test`)
  - [x] Task/logbook updated with checkpoint status
  - [x] Timestamped workspace backup snapshot created
- [x] Patient UI resilience pass for extreme text lengths:
  - [x] Prevented header/detail-card overflow for very long unbroken strings on patient detail page
  - [x] Added safe truncation+tooltip behavior for long patient names/IDs/categories in patients list table
  - [x] Verified with `npm run lint`, `npm test -- --run app/patients/page.test.tsx`, and `npm run build`
- [x] Global UI overflow-hardening pass (dynamic data safety):
  - [x] Hardened appointments day/week cards and patient selector dropdown against long names/reasons
  - [x] Hardened payments invoices table, invoice/payment modals, and patient-picker dropdown against long strings
  - [x] Hardened admin dentists table and category-management list with fixed columns/truncate+tooltip patterns
  - [x] Hardened dashboard upcoming list cards against long patient names/reasons
  - [x] Verified with `npm run lint`, focused regression suites, and `npm run build`
- [x] Migrate invoice PDF generation to Unicode-safe Dompdf + Blade template
- [x] Add RU/UZ localized invoice PDF feature tests
- [x] Backfill and lock localization lane tracking:
  - [x] Static UI i18n for `ru`/`uz`/`en` with default `ru`
  - [x] Locale persistence and request propagation (`cookie` + `X-Locale`)
  - [x] Backend locale middleware and localized API/validation message handling
- [x] Improve language-switcher UX:
  - [x] Dedicated in-app header control (remove from account menu)
  - [x] Compact top-right control on auth pages (login/register/admin login)
  - [x] Compact control on landing header for consistency
- [x] Odontogram condition-form refinements:
  - [x] Place `Condition Type` + `Material` in one responsive row (add form)
  - [x] Add `Other` material option in add/edit selects (no free-text field)
  - [x] Remove condition notes from history UI flow (add/edit forms + history display)
  - [x] Show material only for material-relevant conditions in edit/history (auto-clear on non-material)
  - [x] Fix history edit toggle behavior (Collapse/Edit must exit edit mode)
  - [x] Enforce mutual exclusivity between `Add New Condition` and history `Details/Edit` panels
- [x] UI strict character caps refinement:
  - [x] Set patients list table name cell visual cap to 25 chars (tooltip keeps full value)
  - [x] Set patient detail header name visual cap to 25 chars (tooltip keeps full value)
- [x] UI strict character caps expansion:
  - [x] Apply 25-char cap for dynamic patient names across payments/appointments/dashboard/admin lists
  - [x] Apply 20-char cap for compact phones/payment-method labels in dense lists
  - [x] Apply 20-char cap for category chips in patient/category surfaces
  - [x] Apply 40-char cap for compact appointment reason snippets in cards
- [x] Assistant access + action-log backend lane:
  - [x] Added assistant tenancy fields and tenant-scoped audit-log ownership (`dentist_id`) to schema/model layer
  - [x] Added permission middleware and route-level permission mapping for dentist/assistant APIs
  - [x] Added team-assistant management APIs (`list/create/update/status/reset-password/delete`)
  - [x] Added tenant-scoped audit-log listing API with filters/search/pagination
  - [x] Refactored dentist-owned controllers/requests to use `tenantDentistId()` (assistant-safe data scope)
  - [x] Added assistant-aware auth payload and password-change endpoint
  - [x] Added backend coverage (`TeamAssistantApiTest`, `AssistantTenantAccessTest`, `AuditLogApiTest`) and passed full backend suite
- [x] Assistant-access frontend compatibility lane:
  - [x] Extended API/types for assistant role + team/audit endpoints
  - [x] Updated app shell role-gate to allow assistant sessions
  - [x] Added settings read-only behavior when account lacks `settings.manage`
  - [x] Added locale strings for assistant role/read-only message
  - [x] Passed frontend quality gates (`npm run lint`, `npm run build`)
- [x] Assistant settings UX completion lane:
  - [x] Wired `Team Access` and `Action Logs` tabs into dentist settings with permission-aware visibility
  - [x] Added missing i18n keys for team/audit settings flows in `ru`/`uz`/`en`
  - [x] Hid `Settings` menu entry for assistants without `settings.view`/`settings.manage`
  - [x] Re-validated frontend quality gates (`npm run lint`, `npm test -- --run`, `npm run build`)
- [x] Information architecture refinement for team management:
  - [x] Moved team-related controls out of `/settings` tabs
  - [x] Added account-menu `Team` submenu (between `My Account` and `Settings`) with `Team Access` + `Action Logs`
  - [x] Added dedicated `/team` page and permission-aware tab visibility
  - [x] Re-validated frontend quality gates (`npm run lint`, `npm test -- --run`, `npm run build`)
- [x] IA refinement follow-up:
  - [x] Renamed account-menu entry from `Team` to `Staff`
  - [x] Removed submenu and switched to single `Staff` menu item
  - [x] Added dedicated `/staff` route and kept `/team` as redirect compatibility path
  - [x] Updated locale keys for staff labels and re-validated frontend quality gates
- [x] Staff management UX + assistant-scope hardening:
  - [x] Fixed assistant create/edit modal overflow (`max-h` + internal scroll)
  - [x] Removed `Settings`/`Audit Logs` from assistant permission assignment UI/defaults
  - [x] Enforced backend denial of assistant `settings.*` and `audit_logs.view` even if legacy data contains them
  - [x] Restricted frontend assistant navigation/access so assistants cannot open `Settings` or `Action Logs`
- [x] Staff assistant form completion and failure transparency:
  - [x] Added patient/admin-style required markers/placeholders and stricter input attributes in create/edit modal
  - [x] Added backend validation-to-field error mapping in modal (name/email/phone/password/permissions)
  - [x] Added visible form-level API error surface to prevent silent create/update failures
  - [x] Re-validated frontend quality gates (`npm run lint`, `npm run build`)
- [x] Staff i18n hotfix:
  - [x] Added missing `common.edit` and `common.delete` translation keys for `ru`/`uz`/`en`
  - [x] Re-validated frontend quality gates (`npm run lint`, `npm run build`)
- [x] Action Logs cleanup + localization pass:
  - [x] Localized event-type labels in dropdown and list cards (with fallback formatter)
  - [x] Removed `auth.login`, `auth.logout`, and `team.assistant.*` from Action Logs options/results
  - [x] Added `settings.logs.ip` and `role.admin` translations for `ru`/`uz`/`en`
  - [x] Re-validated gates (`npm run lint`, `npm run build`, `php artisan test --filter=AuditLogApiTest`)
- [x] Select ghost-chevron regression fix:
  - [x] Removed Radix select scroll up/down controls from shared select content rendering
  - [x] Re-validated frontend quality gates (`npm run lint`, `npm run build`)

---

## ✅ MVP Frontend Complete!

All core features implemented with mock data:
- ✅ Dashboard with 3 key metrics
- ✅ Patient management (list, search, add, detail)
- ✅ Interactive odontogram (32-tooth chart)
- ✅ Appointment scheduling (day/week views)
- ✅ Payment tracking (invoices, record payment)

**Ready for:**
- User testing and feedback
- Backend integration
- Production deployment

---

## 2026-04-01

- [x] Patient history: clinical snapshot implementation
  - [x] Added a dedicated clinical snapshot section above the history table
  - [x] Added show/hide toggle for the snapshot block
  - [x] Wired snapshot to real treatment data (entries, linked teeth, latest entry date)
  - [x] Wired snapshot to real odontogram summary data (affected teeth + latest conditions)
  - [x] Added direct shortcut to full odontogram from snapshot
  - [x] Added `ru`/`uz`/`en` localization keys for snapshot UI
  - [x] Re-validated quality gates (`npm run lint`, `npm test`, `npm run build`)
- [x] Patient history: snapshot hardening follow-up
  - [x] Prevented misleading `0` values while history data is still loading (skeleton placeholders shown instead)
  - [x] Added safe fallback display when history fetch fails and no rows are available
  - [x] Stabilized latest-condition badge keys to avoid duplicate-key UI edge cases
  - [x] Re-validated quality gates (`npm run lint`, `npm test`, `npm run build`)

## 2026-04-05

- [x] Appointment scheduling rule change: allow past time slots
  - [x] Removed backend past-slot rejection from appointment create/update API path
  - [x] Removed frontend past-slot blocking in add-appointment dialog and day-view drag/drop
  - [x] Restored add-slot actions for past slots in day view
  - [x] Updated appointment tests for new behavior
  - [x] Re-validated with focused checks:
    - [x] `npm.cmd test -- components/appointments/add-appointment-dialog.test.tsx`
    - [x] `npm.cmd test -- app/appointments/page.test.tsx`
    - [x] `npm.cmd run lint -- app/appointments/page.tsx components/appointments/add-appointment-dialog.tsx components/appointments/add-appointment-dialog.test.tsx`
    - [x] `php artisan test --filter=AppointmentApiTest` (run from `backend`)
