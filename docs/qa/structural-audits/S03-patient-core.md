# Structural audit: patient core

- Date: 2026-08-14
- Auditor: Codex
- Base/final commit: `3bb7dc2` / `d5dd4af`
- Environment: local source review, Vitest/JSDOM, optimized Next build, GitHub Actions PHP 8.4/Laravel/SQLite and Chromium, Vercel/Railway deployment status, production read-only HTTP
- Risk tier: A
- Dependencies: S00, S01, S02
- Data classification: patient identity and contact data, demographics, clinical summary fields, profile images, tenant-scoped recent shortcuts, categories, attribution, archive state, and audit events
- Production restrictions: read-only guest HTTP smoke only; no patient lookup, authenticated session, create/update/archive/delete, category mutation, appointment conversion, upload, export, or database write

## Result

Status: STABLE

All verified findings are fixed. Local gates, required GitHub Actions, merge,
Vercel/Railway deployment, and read-only production smoke passed for merge
commit `d5dd4af`.

## Inventory

- Dentist patient list, bounded search/filter/sort/pagination, recent shortcuts,
  patient detail, profile summary, archive/restore, and permanent deletion
- Patient identity allocation, tenant ownership, normalized create/update input,
  attribution, category assignment, and patient-category CRUD
- Guest appointment to patient-card conversion where the patient identity
  contract crosses into S11
- Frontend query keys/cache invalidation, patient list/detail mock routes, API
  client contracts, OpenAPI, core guardrails, backend feature/unit tests, and
  responsive/accessibility browser journeys
- Patient media fields were checked only at the patient-core contract boundary;
  upload, sanitizer, variants, recovery, and editor behavior remain owned by S05

## Layer coverage

| Layer | Status | Evidence/notes |
| --- | --- | --- |
| Product contract | PASS | The active list/detail/category/recent/archive surfaces are explicit; recent shortcuts are non-critical navigation metadata and guest appointment conversion reuses the same identity contract. |
| UX and states | PASS | Patient list/detail loading, empty, error, archive, photo-preview, search-length, and responsive states were reviewed; canonical detail caching no longer splits by a read-side-effect flag. |
| Frontend architecture | PASS | Patient detail reads use one query key; recent recording is an explicit best-effort mutation with targeted invalidation; growing patient aggregation uses bounded 100-row pages. |
| API contract | PASS | List/lookup validation, normalized payloads, permission/404/422/204 behavior, backward-compatible `per_page` acceptance with a 100-row response cap, and all active S03 routes are represented in the 67-path OpenAPI contract. |
| Authorization and privacy | PASS | Laravel and local mock routes enforce `patients.view`/`patients.manage`, tenant ownership, archive prerequisites, CSRF on the recent mutation, and non-sensitive audit metadata server-side. |
| Data integrity | PASS | Patient/category/guest-conversion mutations and audit events are atomic; tenant-scoped patient-code allocation and recent ordering are serialized with locks/upsert and bounded retries; no schema migration was required. |
| Performance | PASS | List input and pages are bounded, search is length-limited, recent shortcuts are capped, identity retries are bounded, and the reviewed service paths do not add an unbounded browser or database loop. |
| Operations | PASS | No new worker, cron, storage, or migration dependency was introduced; required CI passed and Vercel, both Railway app/API services, and both cron deployments reported success for the merge commit. |
| Accessibility/responsive/i18n | PASS | Patient list and detail were added to the Laravel-backed Chromium WCAG/responsive matrix on desktop, 390x844 mobile, and 768x1024 tablet without horizontal overflow or serious accessibility violations. |
| Verification | PASS | Focused regressions, full frontend/build gates, backend/migration/security/browser CI, deployment statuses, and guest-only production smoke all passed. |

## Findings

| ID | Severity | Finding | Evidence | Fix/test | Status |
| --- | --- | --- | --- | --- | --- |
| S03-001 | P1 | Patient detail `GET` could mutate the recent-patient list, so browser prefetch/retry and cross-site safe requests could change server state. | Detail controller, frontend `remember_recent` query flag, and mock detail route. | Make detail `GET` read-only; add an explicit permission- and CSRF-protected `POST /patients/recent/{id}` with canonical query keys and frontend regression coverage. | FIXED |
| S03-002 | P1 | Several patient/category/guest-conversion writes could commit domain state separately from their audit event or cleanup path. | Patient, category, and appointment service mutation sequences. | Wrap coherent domain mutation and audit recording in database transactions; feature regressions cover success, rollback-sensitive contracts, tenant isolation, and archive/delete rules. | FIXED |
| S03-003 | P1 | Patient code generation used a check-then-insert sequence that could collide under concurrent creates within one tenant. | Previous patient and guest-card creation paths. | Centralize creation in `PatientIdentityService`, require an active transaction, lock the tenant owner row, and use bounded collision retries; unit/feature coverage verifies the tenant code contract. | FIXED |
| S03-004 | P2 | Recent shortcut update/prune used race-prone read/update/delete steps that could duplicate or incorrectly order shortcuts. | Previous recent-patient service sequence. | Use database-native upsert under the profile lock, cap the list deterministically, and retry only a bounded number of times; explicit recent-route tests added. | FIXED |
| S03-005 | P2 | Patient list and lookup inputs were not fully bounded or normalized, while older clients legitimately sent `per_page=500` and expected the server to cap the response at 100. | List request/service, API integration contract, and local mock route. | Add `ListPatientsRequest`, trim/bound search/filter/page values, retain acceptance through 500, cap the actual page at 100, and align mock/OpenAPI/tests. | FIXED |
| S03-006 | P2 | Identity and category text could be validated before trimming, allowing whitespace drift and inconsistent duplicate/default behavior. | Store/update patient and category request preparation. | Normalize optional/identity/category values before validation and mirror the behavior in local contracts with focused tests. | FIXED |
| S03-007 | P2 | Local patient/category mock routes diverged from Laravel permissions, status codes, persistence, cascade cleanup, and archive prerequisites. | Next mock API route inventory. | Align permission gates, validation, 404/422/204 responses, in-memory persistence, category detach, and patient-related mock cleanup; contract tests added. | FIXED |
| S03-008 | P2 | OpenAPI omitted active patient/category/recent/archive routes and material schema/validation details. | Previous contract inventory and validator allow-list. | Document the active S03 surface, response/request schemas, bounds, archive/media fields, and require every route in the OpenAPI guardrail. | FIXED |
| S03-009 | P2 | Mandatory browser coverage scanned the patient list but did not prove patient detail responsive layout or serious WCAG violations. | Previous Playwright responsive/accessibility inventory. | Add patient list/detail navigation, overflow assertions, and accessibility scans to the required Laravel-backed Chromium suite. | FIXED |

## Commands and environments

```text
npm run lint
npm exec tsc -- --noEmit
npm test                                      # 86 files, 501 tests
npm test -- --run <patient contract files>    # final focused rerun: 2 files, 13 tests
npm run check:core-guardrails
node scripts/validate-openapi.mjs              # 67 paths
npm run build                                  # Next production build, 58 route entries
npm exec playwright test -- --list             # 19 browser tests discovered
git diff --check
```

No supported local PHP 8.4 binary or usable local browser runtime was available,
so GitHub Actions supplied the authoritative empty-database migration, complete
backend suite, dependency security, and Laravel-backed Chromium evidence. PR
run `31796264401` passed Frontend Quality, Backend Tests, Dependency Security
Audit, and Browser Journeys and Accessibility. The first backend run exposed
two test/compatibility issues; both were corrected before the authoritative
green run.

## Production smoke

Post-deploy read-only smoke for `d5dd4af`:

- `https://api.identa.uz/api/v1/health` -> 200 with `status: ok`, API CSP,
  HSTS, restrictive permissions/referrer policy, and the production frontend
  as the credentialed CORS origin
- unauthenticated `GET /api/v1/patients` and `/api/v1/patient-categories` ->
  401 JSON without patient/category data
- `https://identa.uz/patients` as guest -> 307 to
  `/login?from=%2Fpatients` with CSP, HSTS, and `X-Robots-Tag: noindex`
- `https://identa.uz/login` -> 200 with CSP, HSTS, noindex, frame, content-type,
  referrer, and permissions-policy headers
- Vercel, both Railway app/API services, subscription cron, and account-cleanup
  cron reported success for the same merge commit

## Blocked, accepted, or not tested

- No authenticated production patient read or mutation was performed, so no
  real patient, category, audit, appointment, or financial data was exposed or
  changed.
- PostgreSQL concurrency was not stress-injected in production; transaction,
  locking, uniqueness, retry, and rollback behavior is covered in local/CI
  code paths and tests. Destructive recovery remains a staging-only exercise.
- Clinical history/treatment semantics remain S04; media upload/editor/storage
  lifecycle remains S05; patient finance/export/PDF remains S06.
- Firefox/WebKit, zoom, and manual screen-reader speech remain cross-project S19
  evidence and are not an open S03 defect.

## Reopen triggers

- Changes to patient pages/query keys/API client, patient/category/recent mock
  routes, patient/appointment controllers/requests/services, patient/category/
  recent/audit models or schema, identity allocation, archive/restore/delete,
  permissions, OpenAPI, or patient browser journeys
- Changes in S02 auth/CSRF/tenant ownership, S04 clinical attribution, S05 media
  fields/storage lifecycle, S06 finance, S08 staff permissions, S11 guest-card
  conversion, S14 public API rules, S15 schema, or S20 deployment policy
- Patient code collision, cross-tenant access, unexpected recent-list mutation,
  orphaned patient relations, audit/domain drift, patient endpoint 5xx cluster,
  failed deployment, or relevant dependency advisory

## Final verification

Patient core now has read-only detail retrieval, an explicit CSRF-protected
recent mutation, canonical frontend caching, bounded/compatible list contracts,
normalized input, tenant-serialized patient identity allocation, atomic domain
and audit writes, production-aligned mocks, complete active OpenAPI coverage,
and required patient detail WCAG/responsive evidence. CI, merge, all deployment
statuses, and read-only production smoke passed at `d5dd4af`; S03 is closed as
STABLE.
