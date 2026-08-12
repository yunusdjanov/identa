# Identa Layered Structural Audit Standard

- Version: 1.0
- Effective date: 2026-08-11
- Scope: web frontend, backend API, database, background processing, and production infrastructure
- Route-level companion: `docs/qa/PAGE_AUDIT_STANDARD.md`
- Program tracker: `docs/qa/STRUCTURAL_AUDIT_TRACKER.md`

## 1. Purpose

This standard turns project-wide audits into a repeatable engineering process.
The structural tracker owns functional systems and cross-cutting architecture;
the page tracker owns the 29 routed user surfaces. A section is never changed
only to make an audit look active: verified-stable code remains untouched.

An audit result is evidence for one commit and environment, not a permanent
claim that a section can never regress.

## 2. Default no-harm operating policy

1. Production verification is read-only. Create, update, delete, migration
   rehearsal, queue-failure injection, and destructive recovery tests run in
   local/CI or a production-like staging environment.
2. A production-only defect may use an isolated synthetic test tenant only
   with explicit approval, synthetic data, a bounded plan, and deterministic
   cleanup. Real patient or financial data is never used for testing.
3. Each structural section is handled on a focused branch and small pull
   request. Required CI must pass before merge; direct or force pushes to
   `main` are outside the default workflow.
4. Migrations are additive and backward-compatible by default. Destructive
   schema/data work requires counts, backup, rollback rehearsal, orphan checks,
   and explicit production approval.
5. Audit work must not read, print, or persist production secrets. Logs and
   evidence must redact patient, credential, token, and financial identifiers.
6. Web, backend, database, workers/crons, Vercel, and Railway are in scope.
   A mobile UI audit is a separate track, but public API compatibility with a
   mobile client remains a required backend check.

## 3. Status and severity model

Section status:

- `NOT STARTED`: no current-commit evidence exists.
- `IN PROGRESS`: audit or remediation is active.
- `BLOCKED`: a mandatory check cannot be completed, or an open P0/P1 exists.
- `CONDITIONAL`: no open P0/P1, but explicitly accepted P2/P3 or a non-critical
  verification gap remains.
- `STABLE`: every mandatory layer has current evidence and no verified defect
  remains open in the audited scope.
- `REOPEN`: a dependency or risk trigger invalidated the previous evidence.

Defects use the P0-P3 definitions in `docs/qa/PAGE_AUDIT_STANDARD.md`. A
verified P3 is still fixed unless the user explicitly accepts it as follow-up.
No numeric average or percentage can override a blocking finding.

## 4. Mandatory audit layers

Every structural section is reviewed through the following layers. A layer may
be `N/A`, but the report must explain why.

| Layer | Required questions |
| --- | --- |
| Product contract | Is there one documented source of truth? Are active and legacy surfaces unambiguous? |
| UX and states | Do primary, loading, empty, error, retry, offline, and destructive states behave intentionally? |
| Frontend architecture | Are state ownership, query keys, cache invalidation, concurrency, rendering, and bundle cost correct? |
| API contract | Do validation, response types, pagination, status codes, idempotency, and OpenAPI match? |
| Authorization and privacy | Are auth, role, permission, subscription, tenant ownership, logging, and export/download boundaries enforced server-side? |
| Data integrity | Are transactions, locks, constraints, money/date handling, attribution, soft deletion, and rollback behavior safe? |
| Performance | Are queries bounded and indexed, N+1 avoided, media sized, jobs bounded, and browser work proportional? |
| Operations | Are queue/cron/retry/recovery, observability, deployment, backup, and rollback paths complete? |
| Accessibility/responsive/i18n | Do relevant surfaces satisfy WCAG 2.2 AA, required viewports, zoom, keyboard, and `ru`/`uz`/`en` behavior? |
| Verification | Do focused regression tests, broader gates, CI, and read-only production smoke support the result? |

High-risk sections must additionally apply the relevant gates in section 6 of
`docs/qa/PAGE_AUDIT_STANDARD.md` and the release blockers in
`docs/qa/CORE_QUALITY_RULES.md`.

## 5. Section workflow

1. Record the base commit, branch, environment, dependencies, risk tier, and
   destructive actions that are forbidden in production.
2. Inventory the frontend entry points, APIs, services, models/tables, jobs,
   environment settings, and tests that implement the section.
3. Review every mandatory layer and record evidence as `PASS`, `FAIL`, `N/A`,
   `BLOCKED`, or `NOT TESTED`.
4. Reproduce each failure before editing. State the expected and actual result,
   affected roles/tenants/currencies, severity, and rollback risk.
5. Fix the smallest coherent cause. Do not mix unrelated cleanup or refactors.
6. Add a regression test that fails on the previous behavior when practical.
7. Run focused checks, then the proportional broader gate from
   `docs/qa/COMMAND_MATRIX.md`.
8. Update the section report and tracker with the final commit and evidence.
9. Merge only after required CI succeeds. Perform read-only production smoke
   after deploy and record the deployed commit.

## 6. Definition of Done

A section may be marked `STABLE` only when:

- scope, source of truth, dependencies, roles, tenants, data classification,
  and production restrictions are documented;
- every mandatory audit layer has evidence and no mandatory item is blocked;
- every verified defect in scope is fixed or explicitly accepted by the user;
- bug fixes include regression coverage where practical;
- lint/type checks, focused tests, and proportional integration/build checks
  pass;
- API/schema changes have compatibility, migration, and rollback evidence;
- the branch is clean, the audit report is current, and required CI is green;
- production smoke is read-only and confirms the deployed commit without
  exposing or mutating real data.

`STABLE` means no defect was found in the tested scope at the recorded commit.
It is not a guarantee that untested environments or future changes are safe.

## 7. Reopen triggers

A stable section returns to `REOPEN` when any of these occur:

- a source file, public API, shared component, model/table, job, permission, or
  environment contract listed by the report changes;
- a dependency or framework security advisory affects the section;
- a production incident, Sentry issue, 5xx cluster, queue backlog, failed cron,
  or data-integrity anomaly touches the section;
- a shared-shell, auth, finance, media, tenant, or infrastructure change can
  alter its behavior;
- the report's mandatory evidence is older than the release being certified.

Reopening is dependency-based, not date-based. Unrelated changes do not erase
valid evidence.

## 8. Section report template

Create `docs/qa/structural-audits/<section-id>-<slug>.md`:

```md
# Structural audit: <section>

- Date:
- Auditor:
- Base/final commit:
- Environment:
- Risk tier:
- Dependencies:
- Data classification:
- Production restrictions:

## Result

Status: NOT STARTED | IN PROGRESS | BLOCKED | CONDITIONAL | STABLE | REOPEN

## Inventory

## Layer coverage

| Layer | Status | Evidence/notes |
| --- | --- | --- |

## Findings

| ID | Severity | Finding | Evidence | Fix/test | Status |
| --- | --- | --- | --- | --- | --- |

## Commands and environments

## Production smoke

## Blocked, accepted, or not tested

## Reopen triggers

## Final verification
```

## 9. Relationship to route audits

- Structural reports own shared architecture, backend/data integrity, and
  operational contracts.
- Page reports own route-specific UX, accessibility, responsive behavior, and
  end-to-end user jobs.
- A shared finding is fixed once in the owning structural section, then every
  affected page report records revalidation rather than duplicating the fix.
- A historical page report whose commit predates the current baseline is
  evidence of past work only and cannot establish current readiness without
  revalidation.
