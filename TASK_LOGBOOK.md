# Engineering Logbook

## Program Status
- Current date: 2026-03-11
- Phase 1 (frontend professionalization): Completed
- Phase 2 (production architecture and real backend integration): Completed (local-ready); production hardening pending for go-live

## Phase 1 Closure
Completed outcomes:
- Lint and build gates passing
- Timezone-safe local date handling in frontend flows
- UI copy/encoding cleanup
- Admin dashboard stat consistency fixes
- Mock-mode README and project hygiene updates

Verification at close:
- `npm run lint` passed
- `npm run build` passed

## Phase 2 Charter
Build a production-grade full-stack system for solo dentists using:
- Backend: Laravel + PostgreSQL + Redis
- Auth: Laravel Sanctum session auth (httpOnly cookies)
- API style: REST + OpenAPI
- Data model: strict per-dentist ownership isolation
- Roles: `admin`, `dentist`
- Data mode: fully real DB-backed (no mock-data runtime)
- Audit logging: enabled for critical actions

## Confirmed Decisions
- 2026-02-14: Stack chosen as Laravel ecosystem for speed and maintainability.
- 2026-02-14: Google OAuth deferred; use email/password in Phase 2.
- 2026-02-14: All domain flows must be API and DB-backed.
- 2026-02-14: Delivery model will use smaller milestones.
- 2026-02-14: Local-first validation; deployment target to be decided later.

## Phase 2 Definition Of Done
1. All primary flows use real APIs and persisted data:
   - Auth
   - Patients
   - Odontogram and treatments
   - Appointments
   - Payments/Invoices
   - Dentist settings
   - Admin management
2. Authorization enforced server-side for every protected action.
3. Tenant isolation guaranteed: dentist sees/manages only own records.
4. OpenAPI spec exists and matches implemented endpoints.
5. Audit logs recorded for security-sensitive and business-critical actions.
6. CI/local quality gates pass:
   - Frontend lint/build
   - Backend test suite
   - API integration tests
   - E2E critical flow tests

## Phase 2 Milestones

### M0 - Foundation And Contract First
Goal: Establish backend skeleton and API contract before feature coding.

Tasks:
- [x] Initialize Laravel backend workspace.
- [x] Add Docker Compose services: app, postgres, redis, mailpit.
- [x] Configure env templates and local bootstrap scripts.
- [x] Define OpenAPI v1 contract for auth + core domain resources.
- [x] Define error envelope and validation response standard.
- [x] Define pagination/filter/sort conventions.

Acceptance criteria:
- [x] Backend boots locally via one documented command path.
- [x] OpenAPI spec reviewed and approved.
- [x] Healthcheck endpoint works.

### M1 - Auth, RBAC, Security Baseline
Goal: Secure access model and role boundaries.

Tasks:
- [x] Implement registration/login/logout via Sanctum session cookies.
- [x] Password hashing/reset flow.
- [x] Implement role model and policy gates (`admin`, `dentist`).
- [x] Add request throttling on auth endpoints.
- [x] Add CSRF/session security defaults and secure cookie config.

Acceptance criteria:
- [x] Unauthorized access blocked.
- [x] Role-restricted routes enforced.
- [x] Auth integration tests pass.

### M2 - Core Domain APIs (Dentist Scope)
Goal: Real APIs for dentist operational workflows.

Tasks:
- [x] Patients CRUD with dentist ownership scope.
- [x] Appointments CRUD with date/time conflict validation.
- [x] Invoices and payments APIs with balance integrity rules.
- [x] Dentist settings/profile endpoints.
- [x] DB migrations, factories, seeders for dev/test.

Acceptance criteria:
- Domain APIs pass feature tests.
- Tenant isolation proven in tests.
- Business invariants enforced (balance, ownership, conflicts).

### M3 - Admin APIs And Audit Logging
Goal: Complete admin operations with traceability.

Tasks:
- [x] Admin endpoints for account list/create/block/delete/reset.
- [x] Audit log schema and event writer.
- [x] Log critical events: auth, admin actions, patient/payment changes.
- [x] Admin query filters/search for operational support.

Acceptance criteria:
- [x] Admin actions produce corresponding audit entries.
- [x] Non-admin blocked from admin operations.

### M4 - Frontend Integration (Remove Mock Runtime)
Goal: Replace mock data paths with API client and real state.

Tasks:
- [x] Create typed API client layer in frontend.
- [x] Integrate React Query for server state.
- [x] Replace `lib/mock-data.ts` usage in pages/components.
- [x] Wire auth/session handling in frontend route experience.
- [x] Error/loading/empty states standardized.

Acceptance criteria:
- [x] No runtime dependency on mock data.
- [x] Core user journeys complete against local backend.

### M5 - Testing, Quality Gates, And Hardening
Goal: Confidence and release safety.

Tasks:
- [x] Backend unit tests for policies/services.
- [x] Backend feature tests for all API resources.
- [x] API integration tests for auth, tenancy, financial rules.
- [x] Frontend component tests for critical UI logic.
- [x] Playwright E2E for critical flows:
  - [x] Dentist auth + patient lifecycle (full mutation + detail navigation flow)
  - [x] Appointment scheduling lifecycle (full schedule mutation flow)
  - [x] Invoice + payment lifecycle (full payment mutation flow)
  - [x] Admin management lifecycle (full mutation flow)
- [x] Add local/CI command matrix and pass gates.

Acceptance criteria:
- All test suites pass.
- Critical-path E2E stable and repeatable.

### M6 - Release Readiness
Goal: Controlled transition from local-ready to deploy-ready.

Tasks:
- [x] Security checklist review.
- [x] Observability baseline (structured logs, request ids, error tracking hook).
- [x] Backup and migration rollback strategy documented.
- [x] Deployment playbook draft for selected target.

Acceptance criteria:
- Go-live checklist approved.

## Phase 2 Task Board (Cross-Role)

PM track:
- [ ] Freeze Phase 2 scope and acceptance criteria.
- [ ] Define milestone-level review checkpoints.
- [ ] Maintain risk and decision logs weekly.

Architecture track:
- [ ] Finalize domain model ERD.
- [ ] Finalize API contract and versioning policy.
- [ ] Finalize security model and tenancy enforcement pattern.

Development track:
- [ ] Implement milestone tasks M0 to M6 in order.
- [ ] Keep changes incremental and demoable.

QA/Testing track:
- [ ] Build test plan from API contract and user journeys.
- [ ] Maintain regression suite from first integrated flow onward.

## Quality Gates
Mandatory before milestone completion:
- `frontend`: lint + build pass
- `backend`: static analysis + tests pass
- `integration`: contract and API tests pass
- `e2e`: critical journey smoke tests pass

## Risks And Controls
- Risk: contract drift between frontend/backend
  - Control: OpenAPI-first workflow, contract review before implementation
- Risk: broken tenant isolation
  - Control: mandatory policy tests and negative auth tests
- Risk: payment/invoice inconsistency
  - Control: transactional updates + invariant tests
- Risk: scope creep
  - Control: milestone gating and explicit change approval
- Risk: local Docker environment drift or missing installation
  - Control: keep no-Docker setup scripts and verify Docker compose once Docker Desktop is installed

## Work Log
- 2026-02-14: Logbook initialized.
- 2026-02-14: Phase 1 stabilization completed and verified.
- 2026-02-14: Phase 2 stack and strategy approved.
- 2026-02-14: Phase 2 task board and milestones established.
- 2026-02-14: M0 started and completed (Laravel backend scaffolded, docker-compose authored, API contract and conventions documented).
- 2026-02-14: Added `/api/v1/health` endpoint and backend healthcheck feature test.
- 2026-02-14: Updated frontend ESLint ignores for monorepo backend path.
- 2026-02-14: Docker runtime validation deferred because Docker is not installed on this machine.
- 2026-02-14: Docker CLI/Compose installed and config validated, but daemon is not running (`Docker Desktop is unable to start`).
- 2026-02-14: M1 completed (Sanctum session auth endpoints, password reset endpoints, role middleware, admin guard route, throttling, and integration tests).
- 2026-02-14: API contract updated to include password reset endpoints.
- 2026-02-14: M2 started and Patients API delivered (CRUD, dentist ownership enforcement, pagination/search/sort, migration/factory, feature tests).
- 2026-02-14: Appointments API delivered (CRUD, ownership checks, overlap conflict validation, filters, and feature tests).
- 2026-02-14: Invoices/Payments API delivered (invoice CRUD, line-items, transactional payment posting, anti-overpayment invariant, tenancy tests).
- 2026-02-14: Settings profile API delivered (read/update profile fields, working-hours validation, role/auth tests).
- 2026-02-14: M2 completed with migrations/factories/seed data updates and OpenAPI contract alignment.
- 2026-02-14: M3 delivered with full admin dentist lifecycle endpoints (list/create/status update/reset-password/delete).
- 2026-02-14: Added audit logging subsystem (schema, model, writer service) and wired auth/admin/patient/payment critical events.
- 2026-02-14: Added M3 feature tests for admin lifecycle, audit coverage, and blocked-account login enforcement.
- 2026-02-14: OpenAPI contract updated for M3 admin and security/account-status changes.
- 2026-02-14: M4 started with frontend API client and React Query provider integration.
- 2026-02-14: Migrated `dashboard`, `payments`, and `settings` pages from mock runtime to real backend APIs.
- 2026-02-14: Replaced mock login flow with real email/password session login and server logout handling.
- 2026-02-14: Migrated remaining mock-driven routes (`patients/[id]`, `admin`, `admin/login`) to real APIs with role-aware auth guards.
- 2026-02-14: Converted `register` flow to real backend registration API.
- 2026-02-14: Removed odontogram mock runtime and replaced with explicit contract-pending UX until backend endpoints are implemented.
- 2026-02-14: Frontend quality gates re-verified after migration (`npm run lint`, `npm run build` both pass).
- 2026-02-14: Added API pagination aggregation helpers and switched UI queries to avoid silent truncation above API max page size.
- 2026-02-14: Added odontogram and treatment backend modules (migrations, models, validation requests, controllers, routes) with dentist-ownership enforcement.
- 2026-02-14: Extended OpenAPI v1 contract for patient odontogram and treatment endpoints plus request/response schemas.
- 2026-02-14: Added backend feature tests for odontogram/treatment flows and verified full backend suite (`php artisan test`) passes.
- 2026-02-14: Integrated frontend odontogram and patient-detail pages with real odontogram/treatment APIs, including real tooth-condition mutation flow.
- 2026-02-14: Re-verified frontend quality gates after odontogram/treatment integration (`npm run lint`, `npm run build` both pass).
- 2026-02-14: M5 frontend test infrastructure started (`vitest` + Testing Library + jsdom setup, `npm test` script).
- 2026-02-14: Added frontend automated tests for API error handling, API pagination aggregation, and patient creation dialog submission flow.
- 2026-02-14: Re-verified combined frontend gates with tests (`npm run lint`, `npm run build`, `npm test` all pass).
- 2026-02-15: Hardened Playwright local startup scripts (`run-e2e-cleanup.ps1`, backend/frontend port cleanup, localhost host normalization) and wired deterministic E2E pre-clean command.
- 2026-02-15: Iterated on CSRF/session handling in frontend API client (`lib/api/client.ts`, `lib/api/dentist.ts`) and E2E helper flows to diagnose recurring dentist mutation auth issues.
- 2026-02-15: Stabilized Playwright suite to green (`npm run test:e2e` => 4 passed) with critical smoke coverage for dentist and full mutation coverage for admin lifecycle.
- 2026-02-15: Captured residual risk: dentist POST mutation flows remain intermittently vulnerable to auth/CSRF instability under E2E conditions and should be explicitly hardened in next pass.
- 2026-02-15: Re-ran quality gates after regression recovery: backend tests (`php artisan test`) 42 passed, frontend tests (`npm test`) 6 passed, E2E (`npm run test:e2e`) 4 passed in two consecutive runs.
- 2026-02-15: Reverted dentist E2E to stable non-mutating smoke checks (patient list/search dialog, appointment dialog, payment dialog) after confirming recurring 419 CSRF and intermittent unauthenticated failures in dentist mutation/detail journeys.
- 2026-02-15: Added backend unit coverage for `AuditLogger` and `User` model role/status helpers (`backend/tests/Unit/AuditLoggerTest.php`, `backend/tests/Unit/UserModelTest.php`).
- 2026-02-15: Added API integration contract coverage for auth/financial flow and patient pagination/filter/sort/tenancy rules (`backend/tests/Feature/ApiIntegrationContractTest.php`).
- 2026-02-15: Re-verified all current suites after new tests: backend (`php artisan test`) 47 passed, frontend (`npm test`) 6 passed, Playwright (`npm run test:e2e`) 4 passed.
- 2026-02-15: Added root-level quality scripts (`test:backend`, `quality:frontend`, `quality:all`) and command matrix doc (`docs/qa/COMMAND_MATRIX.md`) with README quality-gate updates.
- 2026-02-15: Executed full gate command (`npm run quality:all`) successfully: lint/build/test + backend tests + E2E all passed.
- 2026-02-15: Hardened E2E backend runtime session handling by forcing file-session driver in `scripts/run-e2e-backend.ps1` (eliminated intermittent authenticated-session loss under browser mutation tests).
- 2026-02-15: Restored full dentist mutation/detail E2E assertions in `e2e/critical-flows.spec.ts` with resilient mutation response handling.
- 2026-02-15: Re-validated stability with repeated runs (`npm run test:e2e` passed twice consecutively) and re-ran full quality gate (`npm run quality:all`) successfully.

- 2026-02-15: Finalized M6 release-readiness docs: security checklist, observability baseline, backup/rollback strategy, and deployment playbook draft.
- 2026-02-15: Updated project references (README.md, TASK_LIST.md) to include release-readiness artifacts and tracking closure steps.

- 2026-02-15: Phase 2 go/no-go review completed (docs/release/GO_NO_GO_REVIEW_2026-02-15.md): GO for local/staging progression, conditional NO-GO for production until hardening blockers are closed.
- 2026-02-15: Fixed local auth/session instability when frontend is served on `127.0.0.1` by aligning frontend API loopback host resolution and expanding backend CORS local-origin support.
- 2026-02-15: Fixed hydration mismatch risk in dashboard/patients/appointments by removing hydration-unsafe URL/date initialization patterns.
- 2026-02-15: Reduced perceived slowness during failure scenarios by adding React Query retry policy that avoids repeated retries on 4xx responses.
- 2026-02-15: Hardened local backend startup script (`scripts/run-backend.ps1`) with deterministic port cleanup, local Sanctum/session env overrides, and custom dev router bootstrap (`backend/public/dev-router.php`) to avoid malformed JSON responses in Windows background runs.
- 2026-02-16: Fixed appointments scheduling UX gap by wiring clicked calendar slot context into `AddAppointmentDialog` prefill (`appointmentDate`, `startTime`) and added frontend regression test `components/appointments/add-appointment-dialog.test.tsx`.
- 2026-02-16: Improved appointment modal UX with searchable patient input (name/ID filter), full-width patient/duration selectors, and regression test coverage for patient-search filtering; added jsdom polyfills for Radix select pointer/scroll behavior in `test/setup.ts`.
- 2026-02-16: Refined appointment patient picker to a single select2-like searchable combobox (type-to-filter dropdown + click-to-select + outside-click close) for better UX at scale; updated dialog tests to reflect combobox behavior.
- 2026-02-16: Extended patient picker filtering to include phone-number matching in addition to name/patient ID; added regression test coverage for phone-based search.
- 2026-02-16: Updated patient picker UX to show only phone under patient name (removed patient ID from dropdown row) and changed menu behavior to open on click/typing instead of auto-opening on modal focus; added regression test for closed-by-default behavior.
- 2026-02-16: Implemented day-view drag-and-drop appointment rescheduling with backend `updateAppointment` integration; only scheduled appointments are draggable, drops into occupied slots are rejected with explicit feedback, and successful moves invalidate appointments/dashboard queries.
- 2026-02-16: Added appointment management actions in day view: edit via prefilled appointment dialog (update API path) and hard delete via explicit confirmation dialog (`Confirm Delete`), with mutation toasts and cache invalidation for appointments/dashboard.
- 2026-02-16: Applied status-based edit lock in appointments UI: `completed` and `cancelled` records are not editable (button disabled + runtime guard), while hard delete remains available via confirmation.
- 2026-02-16: Added status management in edit flow by exposing a `Status` selector in appointment edit modal (`scheduled/completed/cancelled/no_show`) for editable records.
- 2026-02-16: Refined appointment card UX by moving status updates to inline per-card control (outside edit modal) and converting Edit/Delete actions to icon-only buttons with accessible labels/tooltips.
- 2026-02-16: Polished appointment card action strip by removing duplicate status badge, color-coding the status selector itself, and softening delete emphasis (ghost icon + red-on-hover) for better visual hierarchy.
- 2026-02-16: Reverted appointment controls per UX direction: restored text `Edit/Delete` actions and moved status change back into Edit modal; additionally implemented status-based full-card coloring for clear at-a-glance state differentiation.
- 2026-02-16: Refined Week View UX: per-day appointments are now locally sorted by start time, the date header shows a small total-count badge, and `+N more` opens a compact dropdown preview list (with direct jump to exact Day view).
- 2026-02-16: Week View visual polish: removed per-day header count badge and restyled `+N more` as a subtle pill-action trigger for cleaner hierarchy.
- 2026-02-16: Replaced plain loading copy with skeleton loaders for key routes (`/dashboard`, `/patients`, `/appointments`, `/payments`) using a shared `components/ui/skeleton.tsx` primitive and page-shaped placeholder layouts.
- 2026-02-16: Extended skeleton-loading UX coverage to `/settings`, `/admin`, and `/admin/settings` with route-specific placeholder structures to reduce perceived render latency and visual jumps.
- 2026-02-16: Enhanced patient management flow: patient code generation switched to compact format `PT-####AA`, patient API now returns `created_at`, patients list now includes row numbering and `Last Visit`, and added a real-data `No Visit 6M` filter powered by completed appointments; verified with frontend lint and backend `PatientApiTest`.
- 2026-02-16: Completed patient list UX refinement pass: moved `last_visit_at` computation to backend patient API (`withMax` on completed appointments), replaced frontend appointment aggregation, added `Needs Follow-up` row badge and styled actions, and implemented inactive-mode quick schedule action that deep-links to appointment modal with prefilled patient selection.
- 2026-02-16: Added frontend regression suite for patient-list enhancements (`app/patients/page.test.tsx`) covering inactive filtering (`No Visit 6M`), follow-up badge visibility, and action routing (`Schedule` deep-link and `View Details`); verified with targeted and full Vitest runs.
- 2026-02-16: Patient detail route improvements delivered: introduced structured skeleton loading state in `app/patients/[id]/page.tsx`, re-enabled real edit capability via new `components/patients/edit-patient-dialog.tsx`, added frontend `updatePatient` API method in `lib/api/dentist.ts`, and wired patient-specific appointment prefill link from detail page.
- 2026-02-16: Completed patient odontogram simplification and billing bridge: removed treatment-dependent UI from odontogram workflow, improved tooth-history discoverability via per-tooth history markers and legend copy, and extended `ToothDetailDialog` with optional invoice item creation (amount/description/due date/notes) that preserves condition save on invoice failure; added regression tests in `components/odontogram/tooth-detail-dialog.test.tsx` and re-verified gates (`eslint`, `npm test`, `npm run build`).
- 2026-02-16: Follow-up UX consistency pass completed: replaced plain odontogram loading text with structured skeleton (`app/patients/[id]/odontogram/page.tsx`), enhanced patient-detail odontogram preview ordering and signal quality (condition color + history count badges in `app/patients/[id]/page.tsx`), and updated landing copy to reflect condition-history + billing workflow (`app/page.tsx`); validation status: `eslint` passed, `build` passed, `npm test` passed after one transient timeout run under local load.
- 2026-02-16: Implemented requested patient-page/odontogram fixes: (1) resolved unreadable white condition labels by standardizing tooth-condition text color in `lib/utils.ts`, (2) extended odontogram billing flow (`components/odontogram/tooth-detail-dialog.tsx`) with `Paid Now` input that can auto-create a cash payment during invoice creation plus validation (`paid <= amount`), and (3) added a dedicated `Billing & Payments` management block on patient detail (`app/patients/[id]/page.tsx`) after appointments, including totals and recent invoice/payment lists; expanded dialog regression suite to cover paid-now validations/payment creation and re-verified gates (`eslint`, `npm test`, `npm run build` all passed).
- 2026-02-16: Enhanced odontogram paid-now billing UX by adding selectable payment method (`cash`, `card`, `bank_transfer`) inside `components/odontogram/tooth-detail-dialog.tsx` and wiring the selected method into `createPayment`; updated regression test to verify non-default method propagation and re-validated (`eslint`, `npm test` passing; Radix select test still emits non-blocking `act(...)` warnings).
- 2026-02-24: Updated patient detail billing flow per UX direction: `Manage Billing` no longer routes to `/payments`; it now toggles an in-page patient-specific billing manager in `app/patients/[id]/page.tsx` with full invoice table, status/balance visibility, and direct `Record Payment` actions via existing `RecordPaymentDialog`; validation completed (`eslint`, `npm test`, `npm run build` all passing).
- 2026-02-24: Iterated billing management UX to a right-side sheet panel in `app/patients/[id]/page.tsx` (instead of inline expansion) for cleaner patient page hierarchy and better table usability; `Record Payment` flow remains unchanged and all quality gates were re-verified (`eslint`, `npm test`, `npm run build` passing).
- 2026-02-24: Reverted billing sheet per UX preference and finalized patient-page billing actions by adding direct `Record Payment` buttons to `Recent Invoices` entries when status is `unpaid` or `partially_paid` in `app/patients/[id]/page.tsx`; maintained existing payment dialog flow and re-validated (`eslint`, `npm test`, `npm run build` passing).
- 2026-02-24: Applied billing presentation redesign on patient detail to align with requested invoice-card style: removed `Recent Payments` subsection, reworked `Recent Invoices` into per-invoice action cards (status/balance header + `View` and conditional `Record Payment` actions), and added quick actions (`New Invoice`, `Payment History`) while preserving current backend capabilities; validated with `eslint`, `npm test`, and `npm run build` (all passing).
- 2026-02-24: Updated patient billing interactions to modal-first UX: `New Invoice`, `Payment History`, and `View` now open as dialogs on patient detail, and invoice cards include `Download` action using browser print-to-PDF flow; backend flow unchanged, full checks passed (`eslint`, `npm test`, `npm run build`).
- 2026-02-24: Completed invoice document parity update: download now uses backend one-click PDF endpoint (`/api/v1/invoices/{id}/download`) and patient-detail `View Invoice` modal now shows invoice-specific payment history, matching download content expectations.
- 2026-02-24: Redesigned backend invoice PDF generator for readability and UX: added branded header, provider/patient cards, structured invoice summary, itemized table, totals panel, payment-history table (with method/notes/amount), and notes/footer while preserving one-click download endpoint and ownership checks; verified with `php artisan test --filter=InvoiceApiTest` (7 passing).
- 2026-02-24: Added full billing edit/delete workflow: backend payment `update`/`destroy` endpoints with transaction-safe invoice recalculation (paid/balance/status), new request validation (`UpdatePaymentRequest`), expanded payment feature coverage (update/delete + ownership guards), frontend API methods (`get/update/delete invoice`, `update/delete payment`), and patient-detail UI actions (invoice edit/delete + payment-history edit/delete dialogs with confirmation and query invalidation); validation passed (`php artisan test --filter=PaymentApiTest`, `php artisan test --filter=InvoiceApiTest`, frontend `eslint`, `npm run build`).
- 2026-02-24: Reduced billing action clutter in patient detail UX by collapsing invoice `Edit/Delete` controls into a `More` dropdown (invoice cards + invoice view modal), preserving existing mutation logic while improving scanability and reducing accidental taps; re-validated with frontend `eslint` and `npm run build`.
- 2026-02-24: Applied compact action refinement to billing UX: removed visible `More` labels in favor of icon-only action triggers and extended dropdown action pattern to payment-history entries for consistency and lower visual noise; re-validated with frontend `eslint` and `npm run build`.
- 2026-02-24: Adjusted invoice-view modal action row for readability: replaced icon-only `download/edit/delete` with labeled buttons while preserving first-row `Record Payment` priority and existing action logic; validation re-run (`eslint`, `npm run build` passing).
- 2026-02-24: Closed remaining payment-action consistency gap by adding `Edit Payment`/`Delete Payment` actions to payment rows inside the invoice-view modal payment-history block (not only in the global payment-history modal); re-validated with frontend `eslint` and `npm run build`.
- 2026-02-24: Implemented full management parity on `/payments`: added invoice row actions (`View`, `Record Payment`, `Download`, `Edit`, `Delete`), invoice view modal with embedded per-invoice payment history and payment edit/delete actions, global payment-history modal with edit/delete actions, and edit dialogs for both invoice/payment backed by real API mutations; validation re-run (`eslint`, `npm run build` passing).
- 2026-02-24: Simplified billing navigation per UX direction by removing standalone `Payment History` trigger/modals from patient detail and `/payments`; payment edit/delete remains available in invoice-context payment sections, with frontend validation re-run (`eslint`, `npm run build` passing).
- 2026-02-24: Refined `/payments` list UX per request: reintroduced `New Invoice` button with creation modal (patient + invoice fields), and replaced table identity columns from `Invoice #/Patient ID` to `#/Invoice Number/Name/Phone` using real patient lookup from API; validation re-run (`eslint`, `npm run build` passing).
- 2026-02-24: Minor `/payments` action-density tweak: converted row-level `View` action to icon-only button (matching adjacent icon controls) while preserving behavior; validation re-run (`eslint`, `npm run build` passing).
- 2026-02-24: Added realistic odontogram tooth rendering in `app/patients/[id]/odontogram/page.tsx`: type-specific SVG anatomy (incisor/canine/premolar/molar), upper/lower orientation inversion, condition-based fill/stroke styling, and preserved history badges/click behavior; validation re-run (`eslint`, `npm run build` passing).
- 2026-02-24: Implemented patient categories end-to-end using future-proof backend many-to-many design with current single-select UI: added `patient_categories` + pivot migrations, `PatientCategory` model/factory, `PatientCategoryController` + store/update request validation + dentist-scoped routes, patient API category assignment/filter support (`category_id`/`category_ids`), frontend API/type support, patients list category filter + badge rendering, `ManageCategoriesDialog`, and category select in add/edit patient dialogs; validation re-run (`php artisan test --filter=PatientCategoryApiTest`, `php artisan test --filter=PatientApiTest`, `php artisan test --filter=ApiIntegrationContractTest`, frontend `vitest app/patients/page.test.tsx`, `eslint`, `npm run build` all passing).
- 2026-02-25: Completed patient form UX/data update: added optional `secondary_phone` as real persisted field (migration `2026_02_25_130000_add_secondary_phone_to_patients_table.php`, model/request/controller/search/transform updates), converted add/edit patient gender to icon-based male/female radio controls, made category select full-width in add/edit dialogs, and added appointment-style confirmation dialog for category deletion (removed browser confirm). Extended patient API tests with secondary-phone coverage and updated frontend tests; re-validated with `php artisan migrate --force`, `php artisan test --filter=PatientApiTest`, `php artisan test --filter=ApiIntegrationContractTest`, `npm test -- components/patients/add-patient-dialog.test.tsx app/patients/page.test.tsx`, `eslint`, and `npm run build` (all passing).
- 2026-02-27: Completed P1 patient-detail performance/scalability pass: replaced eager `listAllAppointments`/`listAllInvoices`/`listAllPayments` usage in `app/patients/[id]/page.tsx` with summary/preview queries (`listAppointments`, `listInvoices`, `listPayments`) and moved invoice payment-history loading to on-demand per-invoice query in modal context.
- 2026-02-27: Hardened invoice summary semantics in `backend/app/Http/Controllers/Api/InvoiceController.php` so `meta.summary` applies active status/statuses/search filters and now returns `total_amount` in addition to outstanding metrics.
- 2026-02-27: Updated contract/tests for new invoice summary field (`docs/api/openapi.v1.yaml`, `backend/tests/Feature/InvoiceApiTest.php`) and re-verified with `npm run lint`, `npm test`, `npm run build`, `php artisan test --filter=InvoiceApiTest`, and `php artisan test --filter=PaymentApiTest` (all passing).
- 2026-02-27: Completed patient-detail odontogram optimization: added dentist-scoped `GET /api/v1/patients/{id}/odontogram/summary` endpoint in `PatientOdontogramController` (totals + affected-teeth count + latest-per-tooth preview with history counts), wired frontend API/types and switched `app/patients/[id]/page.tsx` to summary-based rendering instead of `listAllPatientOdontogram`.
- 2026-02-27: Extended coverage and contract for odontogram summary endpoint (`backend/tests/Feature/OdontogramTreatmentApiTest.php`, `docs/api/openapi.v1.yaml`, `lib/api/dentist.test.ts`) and re-validated full gate (`npm run quality:all`) with all suites passing.
- 2026-02-27: Completed admin dashboard scalability optimization: replaced `listAllAdminDentists` usage in `app/admin/page.tsx` with server-driven `listAdminDentists` query (search + pagination), added table pagination controls, and removed client-side full-list filtering.
- 2026-02-27: Extended admin dentist index contract with summary metrics in `backend/app/Http/Controllers/Api/Admin/DentistAccountController.php` (`total_count`, `active_count`, `new_registrations_7d`) and updated tests/docs (`backend/tests/Feature/AdminDentistManagementTest.php`, `docs/api/openapi.v1.yaml`); re-validated full gate (`npm run quality:all`) with all suites passing.
- 2026-02-28: Started production hardening blocker closure by implementing global backend security-header middleware (`AppendSecurityHeaders`) with configurable CSP/frame/content-type/referrer/permissions headers and proxy-aware conditional HSTS support.
- 2026-02-28: Added hardening regression coverage in `backend/tests/Feature/SecurityHeadersMiddlewareTest.php` and validated with `php artisan test --filter=SecurityHeadersMiddlewareTest` plus health regression run (`php artisan test --filter=HealthcheckTest`).
- 2026-02-28: Added dependency-security gate commands in root `package.json` (`audit:frontend`, `audit:backend`, `audit:deps`, `quality:security`) and updated `docs/qa/COMMAND_MATRIX.md`.
- 2026-02-28: Executed security gate: frontend audit currently fails with advisories (notably `minimatch` high severity and `rollup` high severity in transitive graph), backend `composer audit --locked` passes with no advisories.
- 2026-02-28: Remediated frontend dependency advisories by applying `npm audit fix` (lockfile/package resolution updates) and re-verified `npm run quality:security` is fully green (`npm audit` + `composer audit --locked`).
- 2026-02-28: Re-verified frontend quality suite after dependency remediation: `npm run quality:frontend` passed (`lint`, `build`, `vitest`).
- 2026-02-28: Added CI workflow `.github/workflows/ci-quality-security.yml` to run frontend quality gates, backend tests, and dependency security audits on push/pull-request.
- 2026-02-28: Completed secrets-management implementation baseline: added `backend/config/secrets.php`, `App\Support\ProductionSecretsValidator`, production runtime fail-fast hook in `AppServiceProvider`, and deployment preflight command `php artisan security:check-secrets`.
- 2026-02-28: Added secrets test coverage (`backend/tests/Unit/ProductionSecretsValidatorTest.php`) and re-validated backend suite (`npm run test:backend`) with all tests passing.
- 2026-02-28: Added secrets rollout documentation and operational wiring (`docs/release/SECRETS_MANAGEMENT.md`, deployment pre-flight step in `docs/release/DEPLOYMENT_PLAYBOOK_DRAFT.md`, command matrix updates, root script `npm run check:secrets`).
- 2026-02-28: Implemented provider-backed error tracking with Sentry (`sentry/sentry-laravel`), wired into Laravel exception pipeline (`bootstrap/app.php`) and request scope enrichment (`AttachRequestContext`) for request-id/user correlation.
- 2026-02-28: Added payload scrubbing layer `App\Support\SentryEventSanitizer` and Sentry config (`config/sentry.php`) to redact sensitive fields before outbound error events.
- 2026-02-28: Added unit coverage for sanitizer and Sentry-required secret gate (`SentryEventSanitizerTest`, `ProductionSecretsValidatorTest`), and re-validated backend suite (`npm run test:backend`) and security audits (`npm run quality:security`) green.
- 2026-02-28: Published error tracking ops documentation (`docs/release/ERROR_TRACKING.md`) and aligned release/security docs with implementation status.
- 2026-02-28: Implemented edge/TLS runtime policy enforcement baseline with new `ProductionRuntimePolicyValidator` (HTTPS `APP_URL`, secure cookie, HSTS, Sanctum stateful domains, trusted proxies) and runtime fail-fast hook in `AppServiceProvider`.
- 2026-02-28: Added proxy trust bootstrap wiring in `bootstrap/app.php` (`trustProxies` from `TRUSTED_PROXIES` and `TRUSTED_PROXY_HEADERS`) to align forwarded-proto behavior with production edge setups.
- 2026-02-28: Added runtime preflight command `php artisan security:check-runtime {--production}` and root script `npm run check:runtime-security`; `--production` correctly fails on local non-TLS config, confirming gate behavior.
- 2026-02-28: Added unit coverage `ProductionRuntimePolicyValidatorTest` and re-validated full backend suite (`npm run test:backend`) with all tests passing.
- 2026-02-28: Added release preflight orchestration script `scripts/release-preflight.ps1` and root scripts `release:preflight` / `release:preflight:production`.
- 2026-02-28: Verified `npm run release:preflight` passes locally and `npm run release:preflight:production` passes when production policy env variables are provided.
- 2026-02-28: Published go/no-go re-review document `docs/release/GO_NO_GO_REVIEW_2026-02-28.md` and linked it in project README.
- 2026-02-28: Execution mode updated to non-deployment track by request; production rollout activities deferred while feature/quality work continues.
- 2026-02-28: Completed P1 frontend test-hygiene pass by isolating appointment dialog tests from Radix portal/focus internals, eliminating noisy `act(...)` warning source, and re-validating `npm run quality:frontend` (lint/build/tests all green).
- 2026-02-28: Added unified non-deployment execution board with `Now (P0) / Next (P1) / Later (P2)` lanes and explicit acceptance criteria (`docs/qa/EXECUTION_BOARD.md`).
- 2026-02-28: Completed first P1 accessibility implementation slice across appointments/patients/payments: added missing aria labels/pressed states, improved combobox semantics (`aria-haspopup`/`aria-autocomplete`), enabled keyboard row navigation on patients table, and upgraded gender selector to proper radio-group semantics with keyboard support in add/edit dialogs. Re-validated with `npm run lint`, `npm test`, and `npm run build` (all passing).
- 2026-02-28: Closed remaining P1 accessibility acceptance criteria with manual review artifact (`docs/qa/A11Y_MANUAL_REVIEW_2026-02-28.md`) and follow-up fixes: corrected gender radio arrow-key behavior in add/edit dialogs and improved low-contrast appointment helper text. Validation re-run: `npm run lint`, `npm test`, `npm run build` all passing (one non-blocking Vitest `act(...)` warning still appears intermittently in appointment dialog test runtime).
- 2026-02-28: Completed P1 error/empty-state consistency pass: patients empty state now supports full filter reset (search/category/inactive), payments empty state now provides contextual guidance (`search` vs `outstanding`) plus direct recovery actions (`Clear search`, `Show all invoices`). Re-validated with `npm run lint`, `npm test`, `npm run build` (all passing).
- 2026-02-28: Completed P1 test-coverage expansion: added payments-page UI tests for invoice/payment delete actions (`app/payments/page.test.tsx`), category CRUD dialog regression coverage (`components/patients/manage-categories-dialog.test.tsx`), and category-assignment/secondary-phone submission coverage in patient creation (`components/patients/add-patient-dialog.test.tsx`). Full frontend gate `npm run quality:frontend` passes with 24/24 tests green.
- 2026-02-28: Started P2 architecture cleanup by introducing reusable `ConfirmActionDialog` (`components/ui/confirm-action-dialog.tsx`) and replacing repeated destructive-confirm dialog blocks in `app/appointments/page.tsx`, `app/payments/page.tsx`, `app/patients/[id]/page.tsx`, and `components/patients/manage-categories-dialog.tsx`. Validation re-run: `npm run lint`, `npm test`, `npm run build` all passing.
- 2026-02-28: Completed P2 billing contract/type consolidation slice by introducing shared billing mapping/types module (`lib/billing.ts`) and wiring it into `app/payments/page.tsx`, `app/patients/[id]/page.tsx`, and `components/payments/record-payment-dialog.tsx`. Result: single source for invoice summary/table mapping and lower drift risk between payments and patient-detail billing UIs. Verified with `npm run quality:frontend` (lint/build/tests passing).
- 2026-02-28: Completed P2 coupling-hotspot documentation pass (`docs/architecture/COUPLING_HOTSPOTS_2026-02-28.md`) with concrete reduced hotspots and next extraction targets; architecture lane criteria marked complete in execution board.
- 2026-02-28: Completed P2 performance slice (part 1) on patient detail billing path: moved recent invoice ordering to server-side sort (`-invoice_date,-created_at`), removed local invoice sort in `app/patients/[id]/page.tsx`, narrowed billing mutation invalidation from global invoice/payment prefixes to patient-detail scoped keys, and added short query `staleTime` to reduce refetch churn during active editing sessions. Added performance notes doc `docs/qa/PERFORMANCE_PASS_2026-02-28.md`. Re-validated with `npm run quality:frontend` (lint/build/tests all passing, 24/24 tests).
- 2026-02-28: Completed P2 performance slice (part 2) for invoice payment-history UX in patient detail: replaced fixed large payment fetch with incremental pagination (`20` per page via infinite query) and added `Load more payments` action in invoice modal to improve first-open latency on large histories. Re-validated with `npm run quality:frontend` (lint/build/tests all passing, 24/24 tests).
- 2026-02-28: Completed P2 seeded-data responsiveness verification: added reusable local scripts `scripts/perf-seed.php` and `scripts/perf-snapshot.php` with package commands (`npm run perf:seed`, `npm run perf:snapshot`). Seeded demo dentist dataset to 300 patients / 1211 appointments / 253 invoices / 498 payments, then captured representative heavy-view query timings (max 3 ms, avg 1 ms) and documented results in `docs/qa/PERFORMANCE_PASS_2026-02-28.md`.
- 2026-03-01: Started advanced calendar-rules implementation slice (non-deployment): fixed patient-prefill reliability when opening appointment modal from patient contexts (`/appointments?action=new&patientId=...`), added frontend past-slot guard in appointment dialog (`components/appointments/add-appointment-dialog.tsx`) with regression tests, enforced backend past-slot validation in `AppointmentController` for create/update, and expanded drag/drop overlap checks to validate full moved time range (not only target start slot) in `app/appointments/page.tsx`.
- 2026-03-01: Updated day-view rendering for long appointments to show continuation blocks across all covered 30-minute slots, so a 7:00-9:30 appointment is visually represented beyond the first slot. Validation: `npm run quality:frontend` passed (26/26 tests), `php artisan test --filter=AppointmentApiTest` passed (9/9).
- 2026-03-01: Implemented dashboard appointment-list UX cap: dashboard now shows only 3 upcoming appointments for current day, displays `No more upcoming appointments for today` when applicable, and adds `Show all today (N)` CTA linking to `/appointments` day workflow. Added regression tests in `app/dashboard/page.test.tsx`. Validation: `npm run quality:frontend` passed (28/28 tests).
- 2026-03-01: Completed input-hardening pass for contact/identity flows: introduced shared frontend input utility (`lib/input-validation.ts`) with phone formatting/normalization, email validation, and centralized length limits; applied phone mask + live validation + API normalization to patient add/edit and settings phone fields; applied live email validation/limits to login/register/admin-login/admin-create-dentist; added length counters/limits to core textual fields and category names; surfaced inline field feedback and submit guards before API calls. Validation: `npm run lint`, `npm test` (28/28), and `npm run build` all passing.
- 2026-03-01: Refined input-hardening per UX feedback: removed `0/N` counters and default helper text, switched to error-only inline messaging, enforced practical frontend limits (shorter than backend maximums), tightened Uzbekistan phone validation to `+998` + exactly 12 digits, and added live minimum-length validation (`min 3`) for name/address-style fields while typing (patients/settings/admin/category flows). Re-validated with `npm run lint`, `npm test` (28/28), and `npm run build` (all passing).
- 2026-03-01: Shortened invoice numbering strategy to monthly per-dentist sequence (`INV-YYMM-####`) in `backend/app/Http/Controllers/Api/InvoiceController.php`; added deterministic format/sequence coverage in `backend/tests/Feature/InvoiceApiTest.php`. Validation: `php artisan test --filter=InvoiceApiTest`, `php artisan test --filter=PaymentApiTest`, `npm test -- --run`, and `npm run build` all passing.
- 2026-03-01: Added and executed migration command `php artisan invoices:normalize-numbers` (dry-run + `--commit`) in `backend/routes/console.php` to normalize historical invoice IDs. Result: 253/253 invoices migrated, post-check `invalid_format=0`, `duplicates=0`, and dry-run shows `Planned changes: 0`.
- 2026-03-01: Completed P1 scheduling hardening slice: strengthened patient-prefill reliability for `/appointments?action=new&patientId=...` by stabilizing URL-driven dialog keying/prefill in `app/appointments/page.tsx`; added frontend overlap parity in `components/appointments/add-appointment-dialog.tsx` via day-availability query + conflict guard; updated day-view rendering to always surface continuation occupancy across covered slots; expanded tests in `components/appointments/add-appointment-dialog.test.tsx` and `backend/tests/Feature/AppointmentApiTest.php`. Validation: `php artisan test --filter=AppointmentApiTest` passed (10/10), `npm run lint` passed (warning-only), `npm test -- --run` passed (30/30), and `npm run build` passed.
- 2026-03-01: Updated patient `last_visit_at` semantics to reflect latest clinical activity (max of completed appointment date and odontogram condition date) in `backend/app/Http/Controllers/Api/PatientController.php`; aligned inactive-patients filter (`inactive_before`) to treat recent odontogram entries as activity. Added/updated coverage in `backend/tests/Feature/PatientApiTest.php` and validated with `php artisan test --filter=PatientApiTest` (9/9) and `npm test -- --run app/patients/page.test.tsx` (2/2).
- 2026-03-01: Implemented archive-first patient deletion lifecycle. Backend: enabled soft delete on patients (`backend/database/migrations/2026_03_01_231500_add_deleted_at_to_patients_table.php`, `backend/app/Models/Patient.php`), converted `DELETE /patients/{id}` to archive, added restore endpoint (`POST /patients/{id}/restore`) and guarded permanent delete endpoint (`DELETE /patients/{id}/force`) with dependency checks in `backend/app/Http/Controllers/Api/PatientController.php`, and blocked archived patients from appointment/invoice creation via request validation updates (`backend/app/Http/Requests/StoreAppointmentRequest.php`, `backend/app/Http/Requests/StoreInvoiceRequest.php`). Added backend coverage in `backend/tests/Feature/PatientApiTest.php` (12/12 passing).
- 2026-03-01: Added frontend patient archive management. Detail page now supports archive/restore/permanent-delete confirmations (`app/patients/[id]/page.tsx`) and disables edit while archived; patients list supports archived-only view and in-table restore action (`app/patients/page.tsx`). Added API client methods (`lib/api/dentist.ts`) and patient API type flags (`lib/api/types.ts`), with related test updates in `app/patients/page.test.tsx`. Validation: `npm test -- --run` (30/30), `npm run build` passed, lint remains warning-only on existing dashboard test unused symbol.
- 2026-03-01: Hotfix for archived-patient lookup errors (`No query results for model [App\Models\Patient]`) after archive action. Updated `PatientOdontogramController` and `PatientTreatmentController` to resolve patients with `withTrashed()` for read endpoints and explicitly block new odontogram/treatment writes while archived with clear validation errors. Added regression coverage in `backend/tests/Feature/OdontogramTreatmentApiTest.php` and validated with `php artisan test --filter=OdontogramTreatmentApiTest` (5/5) + `npm run build` passing.
- 2026-03-08: Completed calendar-rules message parity and drag/drop test hardening. Unified appointment conflict/past-slot wording across backend validation and frontend drag/create/edit paths (`backend/app/Http/Controllers/Api/AppointmentController.php`, `components/appointments/add-appointment-dialog.tsx`, `app/appointments/page.tsx`, `lib/appointments/messages.ts`), added canonical-message assertions in backend appointment feature tests (`backend/tests/Feature/AppointmentApiTest.php`), and introduced focused frontend drag/drop interaction coverage (`app/appointments/page.test.tsx`) plus message-normalization regression tests (`lib/appointments/messages.test.ts`). Validation: `npm test -- --run app/appointments/page.test.tsx components/appointments/add-appointment-dialog.test.tsx lib/appointments/messages.test.ts`, `php artisan test --filter=AppointmentApiTest`, `npm run lint` (warning-only pre-existing dashboard test), and `npm run build` all passed.
- 2026-03-08: Refined appointment-slot behavior per UX feedback: made `no_show` appointments non-blocking for create/update/drag-drop conflict checks (backend + frontend parity), enabled `+ Add appointment` CTA on day-view slots that contain only cancelled/no-show entries, and added deterministic same-slot ordering so cancelled items render before scheduled ones when start times match. Added/updated regression coverage in `app/appointments/page.test.tsx`, `components/appointments/add-appointment-dialog.test.tsx`, and `backend/tests/Feature/AppointmentApiTest.php`. Validation: targeted frontend tests (13/13), backend appointment tests (12/12), `npm run lint` (existing warning only), and `npm run build` passed.
- 2026-03-09: Retro-backfilled missed localization milestone: completed static UI internationalization with 3 locales (`ru`, `uz`, `en`) and default locale set to Russian, including dictionary-driven rendering, locale persistence (`identa_locale` cookie), and locale-aware HTML lang updates through provider/config (`components/providers/i18n-provider.tsx`, `lib/i18n/config.ts`, `lib/i18n/dictionaries.ts`, `app/layout.tsx`).
- 2026-03-09: Retro-backfilled API locale propagation and backend localization handling: frontend API client now sends `X-Locale` from active UI locale (`lib/api/client.ts`), backend request locale middleware resolves locale from header/cookie/Accept-Language and localizes framework/API messages (`backend/app/Http/Middleware/SetRequestLocale.php`, `backend/lang/*` translations, `backend/tests/Feature/LocaleMiddlewareTest.php`).
- 2026-03-09: Retro-backfilled localization quality verification: frontend lint/tests/build and backend locale/feature suites were re-run during rollout to validate static-text translation coverage and localized error-message flow.

## Next Immediate Step
Execute demo-polish board P0 lane from `docs/qa/EXECUTION_BOARD.md` (localization integrity, hydration/header stability, and demo-surface visual defect cleanup), then re-run frontend quality gates.

- 2026-03-10: Completed invoice PDF Unicode/localization migration in backend. Replaced manual PDF generation with Dompdf + Blade template (`backend/app/Http/Controllers/Api/InvoiceController.php`, `backend/resources/views/pdf/invoice.blade.php`), removed obsolete low-level PDF helper code, and aligned invoice download test assertions for compressed-stream PDF output (`backend/tests/Feature/InvoiceApiTest.php`). Validation: `php artisan test --filter=InvoiceApiTest` and full `php artisan test` passing.
- 2026-03-10: Added RU/UZ invoice PDF localization feature coverage in `backend/tests/Feature/InvoiceApiTest.php` to assert localized labels/status/payment method/date formatting through rendered PDF view data path; suite now includes explicit RU/UZ template checks and passes (11/11 in `InvoiceApiTest`).
- 2026-03-10: Refined language-switcher UX. Moved in-app language choice to dedicated header control with radio selection and removed language block from account menu (`components/layout/app-layout.tsx`); introduced reusable compact switcher variant (`components/layout/language-switcher.tsx`) and applied top-right compact control on auth screens (`app/login/page.tsx`, `app/register/page.tsx`, `app/admin/login/page.tsx`) plus compact header usage on landing (`app/page.tsx`). Validation: `npm run lint`, `npm test` passing.
- 2026-03-10: Odontogram condition-form UX update in `components/odontogram/tooth-detail-dialog.tsx`: placed `Condition Type` and `Material` on one responsive row for Add Condition flow; added material option `Other` (no free text) in both add/edit selects and localized dictionary keys (`lib/i18n/dictionaries.ts`). Validation: `npm run lint`, `npm test -- components/odontogram/tooth-detail-dialog.test.tsx` passing.
- 2026-03-10: Odontogram history simplification: removed condition notes from add/edit/history UI in `components/odontogram/tooth-detail-dialog.tsx` (notes input fields and notes display hidden), while keeping backend compatibility for existing records. Validation: `npm run lint`, `npm test -- components/odontogram/tooth-detail-dialog.test.tsx` passing.
- 2026-03-10: Odontogram material visibility fix: edit/history now shows `Material` only for material-relevant condition types (`filling`, `crown`, `implant`), and switching condition type to non-material clears material value before save; update payload now drops material for non-material conditions. Implemented in `components/odontogram/tooth-detail-dialog.tsx`. Validation: `npm run lint`, `npm test -- components/odontogram/tooth-detail-dialog.test.tsx` passing.
- 2026-03-10: Odontogram history edit-toggle UX fix: when a history item is in edit mode, clicking `Collapse` now exits edit mode and collapses the card, and clicking `Edit` again toggles edit mode off (without requiring `Cancel`/`Save`). Implemented in `components/odontogram/tooth-detail-dialog.tsx` with regression coverage in `components/odontogram/tooth-detail-dialog.test.tsx` (`exits edit mode when collapse or edit is clicked while editing history item`). Validation: `npm run lint`, `npm test -- components/odontogram/tooth-detail-dialog.test.tsx` passing.
- 2026-03-10: Enforced odontogram panel exclusivity in `components/odontogram/tooth-detail-dialog.tsx`: opening `Add New Condition` now closes any open history details/edit state, and opening history `Edit/Details` now closes the add-condition panel. Added regression coverage in `components/odontogram/tooth-detail-dialog.test.tsx` (`keeps add condition and history edit/details mutually exclusive`). Validation: `npm run lint`, `npm test -- components/odontogram/tooth-detail-dialog.test.tsx` passing (7/7).
- 2026-03-10: Completed P0.1 payments hydration hardening in `app/payments/page.tsx` by introducing client-gated URL parsing (`isClient` + `useSyncExternalStore`) and stable initial filter state to prevent server/client render divergence on URL-filtered entries. Validation: `npm run lint`, `npm test -- app/payments/page.test.tsx` passing.
- 2026-03-10: Completed P0.2 payments query safety fix in `app/payments/page.tsx` by deriving a guarded `selectedInvoiceId`, tightening query enable conditions, and ensuring invoice detail query function never resolves `undefined` (`null` fallback). Outcome: removed React Query runtime warning (`Query data cannot be undefined`). Validation: `npm run lint`, `npm test -- app/payments/page.test.tsx` passing.
- 2026-03-10: Completed P0.3 frontend/backend validation-parity pass across critical forms. Frontend: added `min` enforcement in `lib/input-validation.ts`, localized `validation.text.minLength` keys in `lib/i18n/dictionaries.ts`, aligned amount minimums to `0.01` in payments/patient-detail/record-payment flows, and normalized optional profile phone + patient optional text payload trimming. Backend: aligned constraints in `StorePatientRequest`, `StoreAppointmentRequest`, `StoreInvoiceRequest`, `UpdateProfileRequest`, `Admin/StoreDentistRequest`, `StorePatientCategoryRequest`, `UpdatePatientCategoryRequest`, and auth register validation in `AuthController`. Added focused regression coverage (`lib/input-validation.test.ts`, plus backend feature tests for auth/patient/appointment/invoice/profile/admin/category validation). Validation: `npm run lint`, `npm test`, `npm run build`, and `php artisan test` all passing.
- 2026-03-10: Completed P0.4 migration/schema reliability hardening. Added idempotent schema sync script `scripts/sync-backend-db.ps1` and root command `npm run db:migrate`; updated backend startup script `scripts/run-backend.ps1` to run migration sync automatically before serving and added `-SkipServe` preflight mode for quick local checks; updated migration-check guidance (`scripts/check-backend-migrations.ps1`) and runbook docs (`README.md`, `docs/qa/COMMAND_MATRIX.md`), and wired `quality:all` to include schema sync before migration check. Validation: `npm run db:migrate`, `npm run check:migrations`, and `powershell -ExecutionPolicy Bypass -File .\scripts\run-backend.ps1 -SkipServe` all passing.
- 2026-03-10: Completed P0.5 appointment scheduling reliability pass. Updated URL-driven modal behavior in `app/appointments/page.tsx` to track dismissal by URL signature (`action` + `patientId`) so patient-context scheduling links consistently reopen with the correct prefill; added focused regression coverage in `app/appointments/page.test.tsx` for URL patient prefill propagation and long-appointment continuation occupancy rendering in day view; kept dialog reset behavior deterministic in `components/appointments/add-appointment-dialog.tsx` by preserving explicit state resets after successful submit. Validation: `npm test -- --run app/appointments/page.test.tsx components/appointments/add-appointment-dialog.test.tsx`, `npm run lint`, and `npm run build` all passing.
- 2026-03-10: Stable baseline checkpoint completed (no feature work). Full local gates passed: `npm run lint`, `npm test -- --run` (44/44), `npm run build`, and `backend/php artisan test` (102/102). Created timestamped backup snapshot at `backups/dentalflow-checkpoint-20260310-150922.zip` (source snapshot; excludes cache/build/vendor directories). Git tag was not created because `git` CLI is unavailable in this environment.
- 2026-03-10: Completed patient UI resilience hardening for extreme text input/display. Updated `app/patients/[id]/page.tsx` to prevent layout breaks from very long names/allergies/medical text by adding safe wrapping (`overflow-wrap:anywhere`, `break-words`, multiline-safe badge styles) and improved responsive header/actions layout; updated `app/patients/page.tsx` with table-fixed column widths and truncate+tooltip behavior for long patient IDs/names/categories to avoid row overflow. Validation: `npm run lint`, `npm test -- --run app/patients/page.test.tsx` (2/2), and `npm run build` passed.
- 2026-03-10: Completed global dynamic-text overflow hardening across remaining high-risk UI surfaces. Updated `app/appointments/page.tsx` and `components/appointments/add-appointment-dialog.tsx` (wrap/truncate for long names/reasons and patient dropdown rows), `app/payments/page.tsx` and `components/payments/record-payment-dialog.tsx` (fixed-width invoice table + truncate/tooltip, safe modal text wrapping, and dropdown row truncation), `app/admin/page.tsx` (fixed-width dentists table with truncate/tooltip for name/email/practice), `app/dashboard/page.tsx` (safe truncation/wrapping in upcoming cards), and `components/patients/manage-categories-dialog.tsx` (category-name truncation in list). Validation: `npm run lint`, `npm test -- --run app/appointments/page.test.tsx components/appointments/add-appointment-dialog.test.tsx app/payments/page.test.tsx app/dashboard/page.test.tsx components/patients/manage-categories-dialog.test.tsx` (20/20), and `npm run build` passed.
- 2026-03-10: Applied follow-up overflow/layout correction based on visual QA feedback. Fixed payments table header overlap by explicitly sizing `total/paid/balance` columns and rebalancing fixed widths in `app/payments/page.tsx`; corrected patient detail title behavior in `app/patients/[id]/page.tsx` to truncate long names (tooltip keeps full value); reduced patients list width rigidity by reverting to `w-full` table sizing in `app/patients/page.tsx` while keeping cell-level truncation. Validation: `npm run lint`, `npm test -- --run app/patients/page.test.tsx app/payments/page.test.tsx` (4/4), and `npm run build` passed.
- 2026-03-10: Applied table-width policy correction per UX feedback: removed forced fixed/min-width layout from payments/admin tables (`app/payments/page.tsx`, `app/admin/page.tsx`) to avoid unnecessary horizontal scrolling while preserving truncate+tooltip overflow safety on long cells. Re-validated with `npm run lint`, `npm test -- --run app/payments/page.test.tsx` (2/2), and `npm run build` passing.
- 2026-03-10: Applied strict UI character caps per UX request: patients list name cell now displays max 25 chars and patient detail header name now displays max 25 chars (both with full-text tooltip preserved). Implemented via shared helper `truncateForUi` in `lib/utils.ts`, wired in `app/patients/page.tsx` and `app/patients/[id]/page.tsx`. Validation: `npm run lint`, `npm test -- --run app/patients/page.test.tsx` passing.
- 2026-03-10: Expanded strict UI character caps to remaining dynamic text surfaces for consistency and overflow safety. Applied explicit caps via `truncateForUi` across payments (`app/payments/page.tsx`), appointments (`app/appointments/page.tsx`, `components/appointments/add-appointment-dialog.tsx`), dashboard (`app/dashboard/page.tsx`), admin (`app/admin/page.tsx`), patient/category chips (`app/patients/page.tsx`, `app/patients/[id]/page.tsx`, `components/patients/manage-categories-dialog.tsx`). Validation: `npm run lint` and focused suites (`app/patients/page.test.tsx`, `app/payments/page.test.tsx`, `app/appointments/page.test.tsx`, `components/appointments/add-appointment-dialog.test.tsx`, `app/dashboard/page.test.tsx`, `components/patients/manage-categories-dialog.test.tsx`) all passing.
- 2026-03-10: Settings UX layout refinement in `app/settings/page.tsx`: moved `Start Time`, `End Time`, and `Default Appointment Duration` into one responsive 3-column row (`md:grid-cols-3`) and made duration select full-width (`SelectTrigger w-full`). Validation: `npm run lint` passing.
- 2026-03-10: Patient detail medical-info polish in `app/patients/[id]/page.tsx`: capped allergy badge text to 40 chars for cleaner card density (`truncateForUi` + full tooltip retained) and replaced `break-all` with `break-words` for better readability. Validation: `npm run lint` passing.
- 2026-03-10: Payments filter UX refinement in `app/payments/page.tsx`: replaced duplicate URL-clear controls with search-driven patient filtering flow. `/payments?patientId=<id>` now auto-prefills search with patient name, and any typing/deleting in search clears URL patient filter via history replace, so filter removal is handled directly from the search input. Validation: `npm run lint` and `npm test -- --run app/payments/page.test.tsx` passing.
- 2026-03-10: Implemented assistant access control foundation across backend APIs. Added permission-protected dentist/assistant route mapping in `backend/routes/api.php`, introduced `TeamAssistantController` (`backend/app/Http/Controllers/Api/TeamAssistantController.php`) with create/update/status/reset/delete flows, and added tenant-scoped action-log listing endpoint in `backend/app/Http/Controllers/Api/AuditLogController.php`.
- 2026-03-10: Completed tenant-safety refactor for assistant execution context by switching dentist-owned controllers/requests to `tenantDentistId()` scoping (`AppointmentController`, `PatientController`, `InvoiceController`, `PaymentController`, `PatientCategoryController`, `PatientOdontogramController`, `PatientTreatmentController`, and related store/update request validators). This ensures assistants can only operate within owner-dentist data.
- 2026-03-10: Extended auth/account behavior for assistants in `backend/app/Http/Controllers/Api/AuthController.php`: login now blocks assistants whose owner dentist is inactive/missing, auth payload includes assistant metadata (`dentist_owner_id`, `assistant_permissions`, `must_change_password`), and new authenticated password-change endpoint was added.
- 2026-03-10: Added assistant feature regression coverage:
  - `backend/tests/Feature/TeamAssistantApiTest.php`
  - `backend/tests/Feature/AssistantTenantAccessTest.php`
  - `backend/tests/Feature/AuditLogApiTest.php`
  - `backend/tests/Unit/AuditLoggerTest.php` (tenant dentist-id assertions)
  Validation: `php artisan test` passed (112/112).
- 2026-03-10: Added frontend compatibility for assistant sessions:
  - Extended API types and client methods for assistants/audit logs (`lib/api/types.ts`, `lib/api/dentist.ts`)
  - Allowed assistant role in app shell and role label rendering (`components/layout/app-layout.tsx`)
  - Added read-only settings guard for accounts without `settings.manage` (`app/settings/page.tsx`)
  - Added locale keys for assistant role/read-only notice (`lib/i18n/dictionaries.ts`)
  Validation: `npm run lint` and `npm run build` passed.
- 2026-03-10: Completed assistant settings UX integration:
  - Wired `Team Access` and `Action Logs` tabs into settings (`app/settings/page.tsx`) with explicit permission gates (`settings.view/manage`, `audit_logs.view`) and no-access fallback.
  - Connected existing team/audit components to live settings tabs (`components/settings/team-access-tab.tsx`, `components/settings/audit-logs-tab.tsx`).
  - Added full missing i18n surface for settings team/log flows in `ru`/`uz`/`en` (`lib/i18n/dictionaries.ts`).
  - Updated account menu behavior to hide `Settings` for assistants without settings permission (`components/layout/app-layout.tsx`).
  Validation: `npm run lint`, `npm test -- --run` (44/44), and `npm run build` passed.
- 2026-03-10: Applied IA adjustment for account menu. Removed team/audit from `Settings` tabs and moved them under a new account-menu `Team` submenu (positioned between `My Account` label and `Settings`) in `components/layout/app-layout.tsx`. Added dedicated `/team` route (`app/team/layout.tsx`, `app/team/page.tsx`) that hosts `Team Access` and `Action Logs` with permission-aware visibility and no-access fallback, and added related locale keys (`menu.team`, `menu.teamAccess`, `menu.actionLogs`, `team.*`) in `lib/i18n/dictionaries.ts`. Validation: `npm run lint`, `npm test -- --run` (44/44), `npm run build` passed.
- 2026-03-10: Applied IA follow-up per UX request. Renamed `Team` entry to `Staff`, removed dropdown submenu (single `Staff` item between `My Account` and `Settings`), and routed it to new `/staff` page (`app/staff/layout.tsx`, `app/staff/page.tsx`). Kept `/team` as a legacy redirect target to `/staff` (`app/team/page.tsx`) for compatibility. Added staff locale keys (`menu.staff`, `menu.staffAccess`, `staff.*`) and updated UI to use them. Validation: `npm run lint`, `npm test -- --run` (44/44), `npm run build` passed.
- 2026-03-10: Staff assistant-management stabilization and scope hardening:
  - Fixed assistant create/edit dialog overflow in `components/settings/team-access-tab.tsx` by adding viewport-capped modal height with internal scrolling.
  - Removed assistant-assignable `settings.*` and `audit_logs.view` from frontend permission options/defaults (`components/settings/team-access-tab.tsx`).
  - Restricted frontend assistant access to settings/audit surfaces:
    - `components/layout/app-layout.tsx`: assistants no longer see `Settings` or audit-driven staff entry.
    - `app/settings/page.tsx`: settings page now dentist-only.
    - `app/staff/page.tsx`: audit logs tab now dentist-only.
  - Enforced backend restrictions:
    - `backend/app/Http/Requests/Team/StoreAssistantRequest.php` and `backend/app/Http/Requests/Team/UpdateAssistantRequest.php`: removed `settings.*` and `audit_logs.view` from allowed assistant permissions.
    - `backend/app/Models/User.php`: assistants are hard-blocked from `settings.view`, `settings.manage`, and `audit_logs.view` even if legacy permission payloads exist.
    - `backend/app/Http/Controllers/Api/TeamAssistantController.php`: sanitize now whitelists only allowed assistant permissions (auto-strips legacy disallowed values).
  - Updated backend assertions:
    - `backend/tests/Unit/UserModelTest.php`: added denial assertions for assistant settings/audit permissions.
    - `backend/tests/Feature/AuditLogApiTest.php`: assistant audit access explicitly forbidden even with flag; dentist tenant log listing kept via assistant actor events.
  Validation:
    - Frontend: `npm run lint`, `npm test -- --run` (44/44), `npm run build` passed.
    - Backend targeted: `php artisan test --filter=AuditLogApiTest`, `php artisan test --filter=TeamAssistantApiTest`, `php artisan test --filter=UserModelTest` passed.
- 2026-03-10: Completed staff assistant-form UX/validation finish in `components/settings/team-access-tab.tsx`:
  - Added patient/admin-style required markers and consistent input attributes (`minLength`, `autoComplete`, placeholders) for assistant create/edit fields.
  - Added backend validation error extraction and field mapping (`name`, `email`, `phone`, `password`, `password_confirmation`, `permissions`) so API failures are shown directly under inputs.
  - Added visible form-level API error text inside the modal to avoid silent submission failures.
  Validation: `npm run lint` and `npm run build` passed.
- 2026-03-10: Fixed missing staff translation keys in `lib/i18n/dictionaries.ts` that caused raw key rendering (`common.edit`, `common.delete`) in Team Access action buttons. Added keys for `ru`/`uz`/`en` and re-validated with `npm run lint` + `npm run build`.
- 2026-03-10: Completed Action Logs UX/data-scope pass:
  - Frontend (`components/settings/audit-logs-tab.tsx`): localized event-type labels (dropdown + cards), localized IP label, and filtered hidden event types from rendered entries.
  - Backend (`backend/app/Http/Controllers/Api/AuditLogController.php`): enforced server-side exclusion of `auth.login`, `auth.logout`, and all `team.assistant.*` event types so they never appear in Action Logs API results.
  - i18n (`lib/i18n/dictionaries.ts`): added `settings.logs.event.*` labels for patient/appointment/payment/odontogram/treatment events, plus `settings.logs.ip` and `role.admin` in `ru`/`uz`/`en`.
  - Tests: added regression `hidden_event_types_are_not_returned_in_audit_logs_response` in `backend/tests/Feature/AuditLogApiTest.php`.
  Validation: `npm run lint`, `npm run build`, `php artisan test --filter=AuditLogApiTest` passed.
- 2026-03-10: Fixed floating up/down chevron artifact seen on multiple pages by removing Radix select scroll buttons from shared select content rendering in `components/ui/select.tsx` (`SelectScrollUpButton` / `SelectScrollDownButton` no longer injected). Validation: `npm run lint` and `npm run build` passed.
- 2026-03-11: Started demo-polish execution lane and refreshed the formal execution board (`docs/qa/EXECUTION_BOARD.md`) with explicit P0/P1/P2 items and measurable acceptance criteria for current demo-readiness work.
- 2026-03-11: Fixed frontend quality-gate regression in `app/dashboard/page.test.tsx` by updating dentist API mocks to include `getCurrentUser` (required by current dashboard query path) and re-validating full frontend gates. Validation: `npm run lint`, `cmd /c npm test -- --run` (44/44), `npm run build` all passed.
- 2026-03-12: Restored login reliability after branding/env changes. Root causes: corrupted `APP_KEY` in `backend/.env` (concatenated values) and SQLite `cache` table corruption exposed by `SESSION_DRIVER=database` + `CACHE_STORE=database`. Fixes applied: set valid single `APP_KEY` in `backend/.env` and `backend/.env.docker`, removed repeated `php artisan key:generate --force` from `docker-compose.yml` startup command, switched local `backend/.env` runtime drivers to `SESSION_DRIVER=file`, `CACHE_STORE=file`, `QUEUE_CONNECTION=sync`, aligned demo auth emails to `@identa.test` (`app/login/page.tsx`, `app/admin/login/page.tsx`, `backend/database/seeders/DatabaseSeeder.php`, SQLite user rows), and cleared Laravel caches. Verification: `/sanctum/csrf-cookie` returns `204`, API login for `dentist@identa.test` succeeds, frontend/backend health endpoints return `200`.
- 2026-03-12: Resolved local runtime slowness caused by loopback port conflict on `localhost:8000` (Docker/WSL listeners contending with PHP dev server). Hardening changes:
  - Moved local backend defaults to `localhost:8001` in `scripts/run-backend.ps1` (default `Port=8001`, `BindHost=localhost`).
  - Updated frontend local defaults to match (`.env.local`, `.env.example`, fallback in `lib/api/client.ts`).
  - Updated local app naming in env templates to `Identa` (`.env.local`, `.env.example`).
  Verification:
  - `curl http://localhost:8001/sanctum/csrf-cookie` repeatedly returns `204` in ~20-50ms.
  - Frontend `/login` responds `200` quickly after restart.
- 2026-03-12: Executed P0 stability smoke checkpoint and fixed critical test/regression blockers:
  - Ran full critical E2E suite (`cmd /c npm run test:e2e`) and confirmed all 4 journeys green after fixes.
  - Updated E2E auth helpers to current runtime assumptions:
    - switched seeded emails to `admin@identa.test` / `dentist@identa.test`
    - pinned E2E locale cookie to `en` to avoid locale-dependent selector flakiness
    - kept sign-in credentials aligned with seeded `password123`
  - Updated admin lifecycle E2E generated dentist email domain from `@dentalflow.test` to `@identa.test`.
  - Repaired Russian invoice-PDF localization fixture/test expectations in `backend/tests/Feature/InvoiceApiTest.php` (readable Cyrillic assertions and seed strings).
  - Rewrote `backend/lang/ru/api.php` with clean Russian copy in UTF-8 source.
  Validation:
  - `cmd /c npm run test:e2e` => 4/4 passed.
  - `npm run lint` passed.
  - `npm run build` passed.
  Notes:
  - Could not run `php artisan test --filter=InvoiceApiTest` locally in this shell due missing `php` binary on PATH.
  - Docker daemon was unavailable (`dockerDesktopLinuxEngine` pipe missing), so backend tests were not run via Docker in this pass.
- 2026-03-14: Hardened local runtime boot and auth-expiry UX for the non-Docker workflow:
  - Added shared PHP resolution helper `scripts/resolve-php.ps1` and switched backend scripts to use it instead of assuming `php` is on PATH.
  - Added one-command local boot via `npm run dev:local` / `scripts/start-local.ps1`, with readiness checks for frontend `127.0.0.1:3000` and backend `127.0.0.1:8001`.
  - Standardized local frontend/backend loopback defaults in `.env.local`, `.env.example`, and `backend/.env.example`.
  - Removed Docker-only project files (`docker-compose.yml`, `backend/Dockerfile.local`, `backend/.env.docker`, `backend/.env.docker.example`) and simplified README local-dev instructions.
  - Added client-side session-expiry handling: protected 401/419 responses now trigger redirect to `/login`, and the login page shows a localized "session expired" toast instead of exposing raw `auth.unauthenticated`.
  Validation:
  - `npm run lint` passed.
  - `npm.cmd test -- lib/api/client.test.ts` passed.
  - `npm run build` passed.
  - `npm run dev:local` boots successfully and direct auth flow (`csrf-cookie`, `auth/login`, `auth/me`) returns `200`.
- 2026-03-14: Standardized frontend error sanitization/localization in the shared API client:
  - Added centralized handling for session-expired, permission-denied, inactive-account, network, and generic server errors in `lib/api/client.ts`.
  - Prevented raw backend translation keys and generic transport/internal messages from leaking to users when a localized frontend-safe message is available.
  - Added shared localized error copy in `lib/i18n/dictionaries.ts` for `ru` / `uz` / `en`.
  - Extended regression coverage in `lib/api/client.test.ts` for structured permission codes, translation-key fallback, network errors, server errors, and session-expiry messages.
  Validation:
  - `npm run lint` passed.
  - `npm.cmd test -- lib/api/client.test.ts` passed.
  - `npm run build` passed.
- 2026-03-16: Started the treatment-history backend foundation for the new patient-workflow model:
  - Extended the existing `treatments` domain instead of creating a duplicate history model.
  - Added migration `2026_03_16_020000_expand_treatments_for_history_records.php` to support:
    - multiple teeth via `teeth` JSON
    - optional `comment`
    - `debt_amount` / `paid_amount`
    - fixed `before` / `after` image slots
  - Expanded `Treatment` model/factory to the new history shape while keeping legacy fields for transition safety.
  - Upgraded `PatientTreatmentController` with:
    - create/list for the richer history payload
    - update/delete endpoints
    - fixed before/after image upload, download, and delete endpoints
    - derived balance output (`debt_amount - paid_amount`)
  - Added request classes for treatment update and image upload.
  - Extended API routes for treatment CRUD and image management.
  - Updated backend API translations (`en`, `ru`, `uz`) for archived-patient and image handling messages.
  - Expanded `backend/tests/Feature/OdontogramTreatmentApiTest.php` to cover richer treatment payloads plus treatment image CRUD.
  Validation:
  - `npm.cmd run lint -- app/appointments/page.tsx` remained green after unrelated UI work in the same turn.
  - PHP syntax checks passed for all changed backend files via resolved local PHP.
  Notes:
  - Full Laravel feature execution is currently blocked by a pre-existing fatal parse issue in `backend/tests/Feature/InvoiceApiTest.php`, unrelated to treatment-history changes.

## 2026-03-16 - Step 2 (history-first patient page, partial)
- Updated frontend treatment API types and dentist client methods for multi-tooth history rows, debt/paid amounts, balances, and before/after image endpoints.
- Added a new patient treatment history block as the primary clinical section on the patient detail page with summary totals, add/edit/delete, multi-tooth selection, and optional before/after images.
- Moved appointments above odontogram so the page now follows history-first and odontogram-secondary flow.
- Verification: eslint passed on updated frontend files. Full production build is currently blocked by external Google Fonts fetch during Next.js build, unrelated to this feature.

## 2026-03-16 - Step 3 (payments redesign, patient-first accounting)
- Replaced the old invoice-first payments page with a history-first accounting screen in `app/payments/page.tsx`.
- Added two focused views: `Patients` (patient-oriented balances and summaries) and `History` (global treatment/work ledger).
- Implemented patient accounting modal with per-patient ledger, totals, and direct navigation back to patient detail.
- Added URL-aware patient filtering support (`?patientId=<id>`) with clearable search-driven behavior.
- Updated i18n dictionaries for the new accounting/payment copy in `ru`, `uz`, and `en`.
- Replaced invoice-era tests with new payments-page coverage for patient balances, patient ledger modal, and global history tab.
- Verification:
  - `npm run lint -- app/payments/page.tsx app/payments/page.test.tsx lib/i18n/dictionaries.ts` passed.
  - `npm.cmd test -- app/payments/page.test.tsx` passed (`2/2`).

## 2026-03-16 - Step 4 (patient detail aligned to history-first accounting)
- Rebuilt `app/patients/[id]/page.tsx` around the new treatment-history model instead of the old invoice-first patient detail flow.
- Removed the active invoice/billing block from patient detail and replaced it with a new `PatientAccountingCard` that previews patient-level debt, paid amounts, and current balance from treatment history entries.
- Kept treatment/work history as the primary clinical section and moved odontogram into a secondary supporting role on the page.
- Added patient-accounting copy for `ru`, `uz`, and `en` in `lib/i18n/dictionaries.ts`.
- Verification:
  - `npm.cmd run lint -- app/patients/[id]/page.tsx components/patients/patient-accounting-card.tsx lib/i18n/dictionaries.ts` passed.

## 2026-03-16 - Step 5 (odontogram and cleanup aligned to history-first accounting)
- Updated `components/odontogram/tooth-detail-dialog.tsx` so the optional financial section now creates a treatment/work-history row with debt and paid amounts instead of creating invoice/payment records.
- Kept odontogram entry creation intact while invalidating patient history, payments, and dashboard queries after linked history creation.
- Reworded active odontogram/accounting copy toward work-history and financial-record language, and updated active payment-load fallback copy to refer to accounting data instead of billing data.
- Removed unused frontend invoice-era helpers no longer referenced by the live UI:
  - `components/payments/record-payment-dialog.tsx`
  - `lib/billing.ts`
- Verification:
  - `npm.cmd run lint -- components/odontogram/tooth-detail-dialog.tsx app/patients/[id]/odontogram/page.tsx lib/i18n/dictionaries.ts` passed.

- 2026-03-17: Patient detail page only - merged accounting summary into work history section and replaced card-style history entries with denser ledger rows. Left global payments flow unchanged.

- 2026-03-17: Moved full work history off patient profile into dedicated page (/patients/[id]/history), kept compact summary on profile, and added direct history shortcut button on patients list rows.

- 2026-04-01: Implemented full patient-history Clinical Snapshot above the work-history table:
  - Added new component `components/patients/clinical-snapshot-card.tsx` with professional compact UI and show/hide toggle.
  - Integrated snapshot into `components/patients/treatment-history-card.tsx` directly above debt/paid/net summary and table.
  - Snapshot now uses live data from:
    - treatment history (`entries`, `linked teeth`, `last entry date`)
    - odontogram summary API (`affected teeth`, `latest conditions`)
  - Added quick link to full odontogram from snapshot.
  - Added complete localization keys in `lib/i18n/dictionaries.ts` for `ru` / `uz` / `en` under `patientHistory.snapshot.*`.
  - Validation:
    - `npm run lint` passed
    - `npm test` passed (12 files, 54 tests)
    - `npm run build` passed
- 2026-04-01: Snapshot hardening follow-up (professional stability pass):
  - Updated `components/patients/clinical-snapshot-card.tsx` to show skeletons during initial history fetch instead of temporary `0` metrics.
  - Added safe fallback (`-`) for snapshot metrics when history request fails and no rows exist yet.
  - Stabilized `latest_conditions` badge keys to avoid duplicate React keys on edge payloads.
  - Wired loading/error state from `components/patients/treatment-history-card.tsx` into snapshot props.
  - Validation:
    - `npm run lint` passed
    - `npm test` passed (12 files, 54 tests)
    - `npm run build` passed

- 2026-04-05: Enabled past-slot appointment operations end-to-end.
  - Backend: removed create/update past-time validation guard in `backend/app/Http/Controllers/Api/AppointmentController.php`.
  - Frontend:
    - removed past-time submit block in `components/appointments/add-appointment-dialog.tsx`
    - removed day-view/drag-drop past-slot restrictions in `app/appointments/page.tsx`
  - Tests updated:
    - `backend/tests/Feature/AppointmentApiTest.php` now asserts create/move to past slots are allowed.
    - `components/appointments/add-appointment-dialog.test.tsx` now asserts past-slot submission succeeds.
  - Validation:
    - `npm.cmd test -- components/appointments/add-appointment-dialog.test.tsx` passed (9/9).
    - `npm.cmd test -- app/appointments/page.test.tsx` passed (11/11).
    - `npm.cmd run lint -- app/appointments/page.tsx components/appointments/add-appointment-dialog.tsx components/appointments/add-appointment-dialog.test.tsx` passed.
    - `php artisan test --filter=AppointmentApiTest` passed (13/13).

- 2026-04-13: Treatment-history image delivery hardening.
  - Kept the 5 MB upload limit unchanged.
  - Added backend-generated thumbnail/preview variants for treatment-history images while preserving the original file as the source of truth.
  - Added additive `thumbnail_url` and `preview_url` fields to treatment image API responses; existing `url` remains unchanged.
  - Updated patient history and tooth detail galleries to use thumbnails in chips/rails and preview images in the main viewer.
  - Validation:
    - `npm test -- treatment-history-card.test.tsx patient-photo-preview-dialog.test.tsx tooth-detail-dialog.test.tsx` passed (7/7).
    - `npm run lint` passed.
    - `npm run build` passed.
  - Note: backend PHP test execution is blocked locally because `php.exe` is not available in PATH on this machine.
