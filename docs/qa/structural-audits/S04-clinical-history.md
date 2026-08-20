# Structural audit: clinical history

- Date: 2026-08-20
- Auditor: Codex
- Base/final commit: `2d279a0` / `844c8a6`
- Runtime PR: `#28` (`fix: harden clinical history treatment flows`)
- Environment: local source review, Vitest/JSDOM, optimized Next build, GitHub Actions PHP 8.4/Laravel/SQLite and Chromium, Vercel deployment status, and production read-only HTTP
- Risk tier: A
- Dependencies: S00, S01, S02, S03
- Data classification: patient clinical history, treatment descriptions/comments/notes, teeth, dates, treatment media references, financial fields attached to treatment entries, actor attribution, and audit events
- Production restrictions: guest-only read-only HTTP; no patient lookup, authenticated clinical read, treatment mutation, upload, export, or database write

## Result

Status: STABLE

All verified S04 findings are fixed. Runtime PR and post-merge GitHub Actions,
Vercel production deployment, and guest-safe production smoke passed for merge
commit `844c8a6`. Railway's public API was healthy after merge; its dashboard does
not expose deployment provenance publicly, so exact backend commit attestation
is intentionally deferred to S20 rather than inferred.

## Inventory

- Patient treatment chronology, create/update/delete, financial visibility,
  creator/latest-editor attribution, summary, sorting, and pagination
- Treatment image references and cleanup only where they cross the treatment
  lifecycle; upload scanning, editing, variants, recovery, and storage remain S05
- Frontend history card, validation/focus/error states, query invalidation,
  Next mock routes, Laravel API, OpenAPI, and responsive/accessibility journeys
- The product has no active odontogram. The legacy frontend URL redirects to
  patient history; unused UI components and marketing/route metadata were
  removed. Historical database models/migrations/data remain intact to avoid a
  destructive migration and will be classified under S15.

## Layer coverage

| Layer | Status | Evidence/notes |
| --- | --- | --- |
| Product contract | PASS | Clinical history is the sole active treatment surface; legacy odontogram navigation safely redirects without presenting a second editor. |
| UX and states | PASS | First invalid submit blocks the API call, focuses the first error, exposes accessible error state, and preserves retry behavior; media sync failure invalidates history instead of leaving stale cards. |
| Frontend architecture | PASS | Treatment mock contracts match Laravel authorization, validation, persistence, archive, pagination, summary, financial scrubbing, and attribution behavior. |
| API contract | PASS | Treatment list/detail/create/update/delete, controls, schemas, bounds, and permission-dependent behavior are represented in the 68-path OpenAPI contract. |
| Authorization and privacy | PASS | Tenant ownership and patients permissions are server-side; financial values and cost sorting require payments visibility; audit metadata contains only the patient identifier. |
| Data integrity | PASS | Create/update/delete, patient touch, and audit write are transactional; partial updates preserve omitted clinical/financial values; cleanup is dispatched only after commit. |
| Media boundary | PASS | Deletion plans include displayable, rejected, and quarantined treatment image paths without performing irreversible storage deletion before database commit. |
| Performance | PASS | Page size, page number, boolean controls, sort field count, and sort allow-list are bounded; no new dependency or unbounded browser/database aggregation was added. |
| Operations | PASS | No schema migration, worker, cron, or new service dependency was introduced; CI passed and public frontend/API production smoke was healthy. Exact Railway commit provenance remains an S20 deployment-control check. |
| Accessibility/responsive/i18n | PASS | Form errors use focus and ARIA relationships, obsolete route/skeleton/title/i18n entries were removed, and required Chromium journeys passed. |
| Verification | PASS | Focused regressions, lint/typecheck/build/OpenAPI, complete backend/migration/security/frontend/browser CI, Vercel status, and guest-only production smoke passed. |

## Findings

| ID | Severity | Finding | Fix/test | Status |
| --- | --- | --- | --- | --- |
| S04-001 | P1 | Partial updates could replace omitted optional clinical values instead of preserving them. | Build update payloads only from present keys; regressions cover preservation and explicit clearing. | FIXED |
| S04-002 | P1 | Treatment state, patient recency touch, and audit events were not one atomic unit. | Wrap create/update/delete in database transactions and test rollback when audit persistence fails. | FIXED |
| S04-003 | P1 | Physical media cleanup could diverge from a rolled-back delete and omit rejected/quarantined objects. | Build a complete deletion plan inside the transaction and dispatch it only after commit. | FIXED |
| S04-004 | P1 | A clinical-only viewer could infer financial ordering through `sort=cost` even when values were scrubbed. | Reject cost sorting without `payments.view`; feature and mock contract tests cover the side channel. | FIXED |
| S04-005 | P2 | Treatment list controls were not fully validated or bounded. | Add a dedicated list FormRequest with bounded page/per-page/boolean/sort controls and an allow-list. | FIXED |
| S04-006 | P2 | Clinical/financial treatment content was duplicated into audit metadata. | Keep entity data as source of truth and record only `patient_id` in treatment audit metadata. | FIXED |
| S04-007 | P2 | Mock treatment endpoints diverged from production permissions, archive/404 behavior, persistence, pagination, summary, financial scrubbing, and attribution. | Centralize a mock contract and add CRUD/authorization/validation regression coverage. | FIXED |
| S04-008 | P2 | First invalid form submission could miss visible/focused validation, and failed media sync could leave stale history. | Make validation independent of prior submit state, focus/announce errors, prevent invalid API calls, and invalidate history after media failure. | FIXED |
| S04-009 | P2 | OpenAPI omitted material treatment CRUD/list controls and schemas. | Document the complete active treatment contract and enforce it in the OpenAPI validator. | FIXED |
| S04-010 | P2 | Dead odontogram UI, copy, skeleton/title paths, and landing claims implied a product feature that does not exist. | Remove unused components/copy, redirect the legacy URL to history, and retain only historical database artifacts. | FIXED |

## Commands and environments

```text
npm run lint
npm exec tsc -- --noEmit
npm test                                      # 498/499 on first full run
npm test -- --run <appointment dialog file>   # unrelated timing rerun: 14/14
npm test -- --run <S04 focused files>          # treatment 22/22; mock 7/7; route/shell 32/32; SEO 4/4
npm run check:core-guardrails
npm run check:openapi                          # 68 paths
npm run build                                  # passed with 4 GB Node heap
git diff --check
```

No supported local PHP 8.4 binary was available. GitHub Actions therefore
provided the authoritative empty-database migration and complete backend suite.
The first PR run found one test-harness actor-cache issue; the test was aligned
with the repository's existing multi-session guard reset convention. PR run
`32392282292` and post-merge main run `32392906728` both passed Frontend
Quality, Backend Tests, Dependency Security Audit, and Browser Journeys and
Accessibility.

## Production smoke

Post-merge read-only smoke for `844c8a6`:

- `https://identa.uz/` -> 200 with CSP, HSTS, content-type, frame,
  referrer, and permissions-policy controls
- `https://identa.uz/login` -> 200 with CSP, HSTS, and
  `X-Robots-Tag: noindex, nofollow, noarchive`
- guest `GET /patients/<nonexistent>/history` -> 307 to the encoded login
  return path without protected-shell disclosure
- `https://api.identa.uz/api/v1/health` -> 200 with `status: ok`, restrictive
  API headers, and `https://identa.uz` as the credentialed CORS origin
- unauthenticated treatment list request for a nonexistent patient -> 401 JSON
  without patient or treatment data
- Vercel production status for `844c8a6` -> success

## Blocked, accepted, or not tested

- No authenticated production patient/treatment read or mutation was performed;
  no real clinical, media, attribution, audit, or financial data was exposed or
  changed.
- Railway deployment provenance is not exposed by its public health response or
  this repository's GitHub deployment records. The healthy backend response was
  verified after merge, while exact service/worker/cron commit parity remains a
  release-control item for S20.
- PostgreSQL concurrency and rollback were not fault-injected in production;
  transaction/lock behavior is covered by code review and CI tests.
- Treatment media scanning/editor/storage/recovery remains S05; reconciliation,
  export, and PDF remain S06; schema/legacy-data retirement remains S15.
- Firefox/WebKit, zoom, and manual screen-reader speech remain S19 evidence.

## Reopen triggers

- Changes to patient history UI/query keys, treatment routes/requests/resources/
  services/models, treatment media deletion boundaries, actor attribution,
  permissions, audit logging, mock contracts, OpenAPI, or browser journeys
- Changes in S02 auth/CSRF, S03 patient ownership/archive, S05 media lifecycle,
  S06 financial rules, S08 staff permissions, S14 API rules, S15 legacy schema,
  or S20 deployment policy
- Cross-tenant treatment access, omitted-field loss, clinical/financial audit
  leakage, incorrect attribution, orphaned storage, financial sort disclosure,
  treatment endpoint 5xx cluster, failed deployment, or relevant advisory

## Final verification

Clinical history now has bounded and permission-aware list controls, atomic
treatment/audit mutations, safe partial updates, commit-safe media cleanup,
privacy-minimized audits, reliable creator/editor attribution, production-aligned
mocks, complete API documentation, accessible validation, and no misleading
odontogram product surface. Required CI, merge, Vercel production, and guest-safe
production smoke passed at `844c8a6`; S04 is closed as STABLE, with exact
Railway provenance explicitly owned by S20.
