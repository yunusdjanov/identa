# Core Quality Rules

These rules are release blockers for Identa. They turn the highest-risk
areas into explicit engineering checks instead of relying on memory.

## 1. Patient, payment, upload, and auth changes are high-risk

Any change touching these areas must be reviewed as high-risk:

- patient data, patient profile, patient history, recent patients
- payment ledger, balances, invoices, refunds, subscriptions
- upload prepare, direct upload, finalize, processing, delete, edit
- login, logout, CSRF retry, session expiry, roles, permissions

Minimum expectation: focused tests plus a short note in the PR or release
summary explaining the user-visible behavior and rollback path.

## 2. Bug fixes require regression tests

Bug fix = regression test. The test must fail on the old behavior and pass
with the fix. For UI-only bugs, use the closest reliable component or API
test and add E2E coverage when the flow is critical.

## 3. List endpoints must be paginated

Every endpoint that can return an unbounded collection must expose pagination
metadata and a bounded `per_page` value. Aggregation endpoints may use a
summary shape only when they do not send the whole underlying table to the
browser.

Reference contract: `docs/api/CONVENTIONS.md`.

## 4. Upload finalize must verify real object size and type

Direct upload finalize must validate the stored object, not only the client
ticket. The production default must keep verification enabled:

- `MEDIA_VERIFY_DIRECT_UPLOADS_ON_FINALIZE=true`
- `backend/config/filesystems.php` default must be `true`
- finalize services must use the stored object size before processing

This protects plan limits, worker memory, and storage cost.

## 5. Every release runs the short release checklist

Before deploy, run:

```bash
npm run check:core-guardrails
npm run release:preflight
```

For production deploys, run:

```bash
npm run release:preflight:production
```

`check:core-guardrails` is a fast drift check. It does not replace code
review, but it catches accidental removal of the most important controls.
