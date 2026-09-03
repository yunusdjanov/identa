# Structural audit: patient finance

- Date: 2026-09-03
- Auditor: Codex
- Base/final commit: `9dcf5f7` / `d94fdba`
- Runtime PR: `#33` (`fix: align patient finance contracts`)
- Environment: local source review, Vitest/JSDOM, optimized Next build, npm dependency audit, GitHub Actions PHP 8.4/Laravel/SQLite and Chromium, Vercel, Railway deployment statuses, and production read-only HTTP
- Risk tier: A
- Dependencies: S03, S04
- Data classification: patient identity/profile metadata, treatment work title/date, UZS/USD cost and paid amounts, derived debt, clinic expenses, staff attribution, and finance export output
- Production restrictions: no authenticated patient-finance lookup, expense mutation, treatment mutation, PDF generation from real patient data, synthetic patient creation, schema change, database write, or failure injection; only guest-safe HTTP, deployment status, and health checks

## Result

Status: STABLE

The active finance contract is treatment-entry based: work cost, paid amount,
currency, and derived debt live on the treatment entry. There is no standalone
patient payment flow and no quick payment. Clinic expenses remain a separate
resource. All verified S06 defects are fixed, required CI passed, Vercel and
Railway deployments succeeded for merge commit `d94fdba`, and guest-safe
production smoke is healthy.

## Inventory

- Payments patient ledger, patient-finance detail, payment history, and clinic
  expense list/create/update/delete surfaces
- Treatment-entry `amount`, `paid_amount`, `debt_amount`, and `currency`
  contracts, including UZS/USD aggregation and legacy UZS-only scalar fields
- Patient and expense search/filter/pagination query keys, global summaries,
  localized empty/error/loading states, and responsive tables/cards
- Patient-finance and expense PDF export collection, escaping, pagination
  bounds, and currency-separated totals
- Dentist/staff tenant scope and `payments.view` / `payments.manage`
  authorization boundaries
- Laravel controllers, requests, services, resources, indexes/query bounds,
  local Next mock routes, OpenAPI, regression tests, and production deployment

## Layer coverage

| Layer | Status | Evidence/notes |
| --- | --- | --- |
| Product contract | PASS | Treatment entries are the only active patient-finance source of truth; no standalone payment or quick-payment UI/API is active. Expenses remain a distinct clinic resource. |
| UX and states | PASS | Global summary cards use unfiltered overview queries, so table search/filter changes do not rewrite clinic-wide totals. Table and PDF export now share the same effective search threshold. |
| Frontend architecture | PASS | Query keys separate overview from filtered lists; patient-finance, ledger, expense, PDF, and loading contracts were traced without adding global state or a new dependency. |
| API contract | PASS | Finance endpoints are paginated and bounded, request normalization matches production/local mocks, and OpenAPI documents the returned patient profile/photo fields plus the actual default page size. |
| Authorization and privacy | PASS | Reads require `payments.view`; expense mutations and treatment financial writes require `payments.manage`; server-side dentist scope remains authoritative. Production smoke used no authenticated patient data. |
| Data integrity | PASS | UZS and USD remain separate through storage, aggregation, debt derivation, UI, and export. Expense titles cannot normalize to empty text and nullable quantity follows the service default. |
| Performance | PASS | List endpoints cap page size at 100, overview and filtered data are independent, PDF collection is bounded to 5,000 rows/100 requests, and no unbounded client or database scan was introduced. |
| Operations | PASS | No migration, queue, worker, or finance cron dependency was introduced. Required CI, Vercel, Railway API/app/cron statuses, API health, and guest finance boundaries passed. |
| Accessibility/responsive/i18n | PASS | Existing Chromium/a11y/responsive journeys cover payments and patient finance; the loading skeleton now matches the real nine-column table and page structure. Manual browser breadth remains S19. |
| Verification | PASS | Focused regressions, complete frontend tests, lint, typecheck, OpenAPI, guardrails, optimized build, dependency audit, complete GitHub CI, deployment status, and production smoke support the result. |

## Findings

| ID | Severity | Finding | Evidence | Fix/test | Status |
| --- | --- | --- | --- | --- | --- |
| S06-001 | P2 | A one-character patient or expense search was ignored by the table but applied by PDF export, so exported rows could differ from what the user saw. | The rendered query used a two-character effective search threshold while export used raw trimmed text. | Reuse the effective search value for both export collectors and add patient/expense regressions. | FIXED |
| S06-002 | P3 | The payments loading state rendered an extra summary block and eight table columns while the loaded patient ledger rendered nine. | Skeleton structure and column count diverged from the page. | Remove the unmatched block, use nine columns, and assert direct skeleton structure. | FIXED |
| S06-003 | P2 | An expense title containing only whitespace could pass validation and then be stored as an empty title after service trimming; lowercase currency normalization also differed between boundaries. | Laravel `min:2` ran before service normalization. | Trim the title and trim/uppercase currency before validation; add whitespace, trimming, currency, and nullable-quantity feature cases. | FIXED |
| S06-004 | P2 | Local expense mock routes did not fully mirror production validation, update behavior, `include_summary`, or default pagination. | Development/test route inspection showed mutation-before-validation and response-shape drift. | Add a shared mock request contract, validate before mutation, honor `include_summary`, use the production page default, and add route tests. | FIXED |
| S06-005 | P2 | OpenAPI omitted patient profile/photo ledger fields and documented a different default finance page size than the backend. | Runtime resource/controller contracts differed from the schema. | Document the fields and shared `PaymentPerPage` default; validate all 68 paths. | FIXED |
| S06-006 | P1 | New transitive `fast-uri` high-severity advisories caused the required dependency security gate to fail; `@humanfs/node` also had a moderate advisory. | GitHub Actions run `33749597285` failed the dependency gate on the original PR head. | Update only the npm lock resolution to `fast-uri 3.1.7` and `@humanfs/node 0.16.8` with npm 10; `npm audit` and rerun `33751749286` passed with zero vulnerabilities. | FIXED |

## Commands and environments

```text
npm ci                                      # npm 10 lock install passed
npm audit                                   # 0 vulnerabilities
npm run lint
npm exec tsc -- --noEmit
npm test                                    # 88 files, 515 tests
npm run check:core-guardrails
npm run check:openapi                       # 68 paths
npm run build                               # 58 routes/pages
npm exec playwright test -- --list          # 19 browser tests discovered
git diff --check
```

No supported local PHP 8.4 binary was available. GitHub Actions supplied the
authoritative empty-database migration check, complete Laravel suite, and
Laravel-backed Chromium tests. PR head `e82c95c` produced successful `CI Quality
and Security` run `502` (`33751749286`), including Backend Tests, Dependency
Security Audit, Frontend Quality, and Browser Journeys and Accessibility. The
runtime squash merge is `d94fdba`.

## Production smoke

Post-merge/deployment evidence for `d94fdba`:

- GitHub combined deployment status -> success
- Vercel production deployment -> success
- Railway `earnest-radiance / identa` -> success
- Railway `ingenious-manifestation / identa` API -> success
- Railway subscription cron -> success
- Railway account-cleanup cron -> success
- `https://identa.uz/` -> 200 with CSP and HSTS
- guest `https://identa.uz/payments` -> 307 to the encoded login return path
- `https://api.identa.uz/api/v1/health` -> 200 with `status: ok`
- unauthenticated patient-ledger and expense reads -> 401 without data

## Blocked, accepted, or not tested

- No authenticated production finance read, mutation, or PDF export was
  performed. Real patient, treatment, expense, and payment values were not used
  as audit evidence.
- PostgreSQL locking/concurrency and cross-tenant scenarios were verified by
  source/tests/CI rather than fault-injected against production.
- Legacy invoice/payment tables and models remain intentionally retained for
  production-data safety. They are outside the active product flow; retirement
  or archival requires the S15 schema/data audit and an explicit migration and
  rollback plan.
- S06 has no queue/worker or scheduled finance workflow. Exact fleet-wide
  worker parity is owned by S16/S20; the deployed app/API and both configured
  cron statuses were verified here.
- Manual Firefox/WebKit, zoom, screen-reader speech, and exhaustive viewport
  coverage remain S19. Required Chromium browser/a11y CI passed.

## Reopen triggers

- Changes to treatment work cost, paid amount, debt derivation, currency, or
  patient-finance attribution
- Addition of standalone payments, quick payment, refunds, transfers, mixed-
  currency conversion, or a new finance source of truth
- Changes to ledger/history/expense query keys, filters, summaries, pagination,
  permissions, tenant scope, response fields, or PDF export
- Changes in S03 patient ownership, S04 treatment lifecycle, S08 staff
  permissions, S12 analytics, S14 API boundaries, S15 schema/legacy data, S17
  security, S18 performance, S19 client coverage, or S20 deployment policy
- A finance discrepancy, cross-tenant result, currency mixing, failed export,
  unbounded query, failed deployment, or relevant dependency advisory

## Final verification

Patient finance now has one active treatment-entry source of truth, keeps UZS
and USD separate, derives debt consistently, protects reads and mutations with
server-side tenant/permission gates, and keeps global summaries independent of
table filters. Expenses and PDF export use aligned validated contracts. Full
local verification, required CI, deployment status, and guest-safe production
smoke passed for `d94fdba`; S06 is closed as STABLE.
