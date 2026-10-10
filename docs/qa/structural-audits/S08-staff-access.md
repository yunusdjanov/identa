# Structural audit: staff, team, permissions, limits, blocking, and access revocation

- Date: 2026-10-10
- Auditor: Codex
- Base/final commit: `0586e25` / pending
- Branch: `audit/s08-staff-access`
- Environment: local source review, Vitest/JSDOM, Laravel PHP 8.4 feature suite, optimized Next build, npm 10 lockfile/audit, and Composer 2.10 audit
- Risk tier: A
- Dependencies: S02 authentication/session and S07 account-security contracts
- Roles and tenants: dentist owner, assistant, and platform admin; the owner manages only assistants whose `dentist_id` is the owner practice
- Data classification: staff name, email, phone, role, permissions, active/blocked/deleted state, password-reset state, session/token credentials, subscription plan/seat selection, and privacy-minimized audit metadata
- Production restrictions: no real staff creation/edit/block/delete/reset, no plan transition/payment/webhook replay, no session revocation test, no database write, and no destructive fault injection; production verification is read-only

## Result

Status: IN PROGRESS

The local implementation and broad regression gates are complete. The section
remains in progress until the focused PR is reviewed, required CI is green, the
merged commit is deployed, and a read-only production smoke is recorded.

## Inventory

- Dentist staff page and `TeamAccessTab`: list/search/filter/pagination,
  create/edit, permission selection, block/activate, password reset, and soft
  delete flows
- Laravel team routes, form requests, controller/resource, `TeamAssistantService`,
  user permission normalization, tenant scoping, audit logging, credential
  revocation, and plan-seat enforcement
- Subscription checkout selection, `BillingService` PayX webhook handoff, and
  `SubscriptionService::renewOrActivate` / staff-limit reconciliation
- Next local mock auth/team routes, shared mock state, API client/query cache,
  translations, OpenAPI contract, and frontend/backend regression suites
- Admin staff/dentist presentation was reviewed for responsive/error/loading
  parity; its privileged operations belong to S09

## Layer coverage

| Layer | Status | Evidence/notes |
| --- | --- | --- |
| Product contract | PASS | A dentist owner with `team.manage` owns the team; assistants are tenant-scoped, can be active/blocked/deleted, and a paid plan may activate only its selected active seats. A staff choice at checkout is preserved server-side and applied only by the verified webhook path. |
| UX and states | PASS | Team search is debounced, filter pagination has correct global totals, failed list loads have retry, a destructive block action requires confirmation, deleted accounts cannot be edited, and email identity-change/session consequences are shown before save. |
| Frontend architecture | PASS | Query keys include debounced search/status/page; page correction happens only after a result-changing mutation; state remains local; no dependency was added. Local mock mutation and error behavior now matches Laravel closely enough for development tests. |
| API contract | PASS | Strict create/update/reset/status/delete validation, bounded `filter[search]`/`filter[status]`/pagination, tenant-scoped 404s, soft-delete idempotency, response summaries, and the four team endpoints are represented in OpenAPI. Contract validation covers 72 paths. |
| Authorization and privacy | PASS | Server routes require Sanctum, owner role, fresh password, verified email, active subscription, and `team.manage`; service methods check ownership and protect the owner. Logs omit staff email/phone and audit only action-relevant metadata. Email identity changes retain the existing revocation workflow. |
| Data integrity | PASS | Staff write plus privacy-minimized audit append is one transaction. Plan-limit application no longer reactivates blocked/deleted accounts, and the webhook reads selected IDs only from persisted checkout metadata rather than untrusted callback input. No migration is needed. |
| Performance | PASS | Team lists use bounded pagination and a small tenant-scoped summary query; search is debounced; plan reconciliation scopes active assistants and does not introduce an N+1 path. |
| Operations | PASS | No queue, cron, or schema contract was added. Payment-seat selection stays inside the existing idempotent billing/webhook lifecycle. Rollback is a normal application/lockfile rollback; no production data migration is involved. |
| Accessibility/responsive/i18n | PASS | The destructive action uses the existing accessible dialog primitive, retry/action controls retain labels, deleted actions expose disabled state, and new copy exists in ru/uz/en. Broader route-wide responsive closure remains S19 scope. |
| Verification | IN PROGRESS | Focused frontend/backend regressions, full local suites, lint, typecheck, build, guardrails, OpenAPI, dependency audits, PR CI, deployment, and read-only production smoke are being recorded before closure. |

## Findings

| ID | Severity | Finding | Evidence | Fix/test | Status |
| --- | --- | --- | --- | --- | --- |
| S08-001 | P1 | Selected assistants at checkout were persisted but not passed from the PayX webhook into subscription reconciliation, so a paid plan transition could ignore the owner’s intended active staff. | `BillingService` called `renewOrActivate` without the saved `selected_active_staff_ids`. | Read selection only from persisted billing metadata and pass it through both renewal and plan-switch activation paths; Laravel plan-change regression added. | FIXED |
| S08-002 | P1 | A selected staff ID could be reactivated during plan reconciliation even when that account had been blocked or deleted. | `applyStaffLimit` updated preferred IDs to active before applying the limit. | Prioritize only already-active selected IDs and never update an account to active in the reconciliation routine; blocked-account regression added. | FIXED |
| S08-003 | P2 | Team audit records included raw email/phone values and were appended outside the staff mutation transaction. | Controller audit payload and post-service audit append review. | Move minimal audit logging into `TeamAssistantService` transactions; preserve only permission count, status, or email-changed flags; create/delete failure and no-PII tests added. | FIXED |
| S08-004 | P2 | A status-filtered list showed incorrect total/active/blocked summary counts because all counts inherited the current filter. | List query reused `filter.status` for the summary. | Use a tenant-global bounded aggregate summary independent of the selected list filter; mock/API regression added. | FIXED |
| S08-005 | P2 | Next mock staff endpoints could bypass production-like permission, read-only-plan, validation, password-change, soft-delete, and plan-limit rules. | Mock route parity review. | Centralize staff mutation authorization/validation/seat-limit rules, reject forced-password users, and add route lifecycle/permission/read-only tests. | FIXED |
| S08-006 | P2 | Blocking took effect on one accidental click, list errors had no retry, stale pagination could leave a blank page, and deleted accounts still exposed an edit path. | UI state and mutation-path review. | Add confirmation, retry, safe page fallback, disabled deleted editing, identity-change warning, i18n, and component regressions. | FIXED |
| S08-007 | P2 | Team endpoints were absent from the published API contract. | OpenAPI versus runtime route inventory. | Add team tag, request/response schemas, ID parameter, four paths, and required-path validation. | FIXED |
| S08-008 | P1 | Dependency checks found a critical Next.js RCE plus high frontend/backend dependency advisories. | npm and Composer advisory databases on 2026-10-07. | Non-breaking lockfile updates: Next 16.4.0, axios 1.20.0, sharp 0.35.5, source-map-js 1.2.2; Laravel 12.69.3, CommonMark 2.10.3, Flysystem 3.36.0, and S3 adapter 3.35.3. Production npm and Composer audits are now clean. | FIXED |

## Commands and environments

```text
npm.cmd test -- app/api/v1/_auth.test.ts app/api/v1/team/assistants/route.test.ts       # 5 passed
npm.cmd test -- components/settings/team-access-tab.test.tsx app/api/v1/_auth.test.ts app/api/v1/team/assistants/route.test.ts  # 10 passed
C:\\tmp\\identa-php84-audit\\php\\php.exe artisan test --filter="(TeamAssistantApiTest|AssistantTenantAccessTest|AssistantAccessRevocationTest|BillingLifecycleTest|AdminDentistManagementTest)"  # 58 passed, 247 assertions
C:\\tmp\\identa-php84-audit\\php\\php.exe artisan test                                  # 337 passed, 2060 assertions
npm.cmd test                                                                            # 94 files, 540 tests
npm.cmd run lint                                                                        # pass
npm.cmd exec tsc -- --noEmit                                                            # pass
npm.cmd run check:openapi                                                               # pass, 72 paths
npm.cmd run check:core-guardrails                                                       # pass
npm.cmd run build                                                                       # pass, 58 static pages
git diff --check                                                                        # pass
npx npm@10.9.3 audit --audit-level=high --omit=dev                                     # 0 production vulnerabilities
npm run quality:security                                                                # pass; one reviewed dev-only advisory path
php composer.phar audit --locked                                                        # 0 backend advisories
```

The local shell uses Node 24 while the repository requires Node 22 and npm 10.
The lockfile was regenerated and audited with npm 10.9.3; final CI is the
authoritative Node 22 verification. The Laravel PHP runtime is explicit PHP
8.4.24 at `C:\\tmp\\identa-php84-audit`; the standard helper cannot discover it,
but the full fresh-database Laravel suite passed with that runtime.

## Production smoke

Pending after the protected PR is merged and deployment statuses identify the
new commit. Smoke will be read-only: public/health headers, guest team-route
authorization, and deployment status only. No real staff, plan, payment, or
credential will be changed.

## Blocked, accepted, or not tested

- Production npm and backend Composer audits report no known vulnerabilities.
  The full npm advisory feed reports `GHSA-vfj7-8cjw-p6xm` through the
  development-only lint glob chain. No patched `braces` release exists; the
  suggested forced downgrade would replace the Next 16 lint stack with Next
  14. The repository security gate therefore allows only this exact advisory
  source/URL when every affected lockfile node is marked development-only;
  production exposure or any other high advisory still fails. S17 must recheck
  the vendor release and remove the allowance when a compatible patch exists.
- No real production staff/plan/payment/session mutation or webhook replay was
  performed. These behavior paths are covered locally and must remain
  synthetic outside production.
- Playwright E2E and manual screen-reader/Firefox/WebKit breadth are completed
  by CI/S19; the local E2E launcher cannot discover the explicit temporary PHP
  8.4 runtime.

## Reopen triggers

- Changes to team routes, permission normalization, owner/tenant filtering,
  staff status/delete/reset logic, account-email revocation, audit metadata,
  or local mock auth/team behavior
- Changes to subscription plan limits, checkout selection metadata, PayX
  webhook handling, billing idempotency, or assistant activation behavior
- Relevant auth/session/subscription/dependency advisory, unexpected staff
  activation/deactivation, tenant-isolation failure, or production access
  incident

## Final verification

Pending protected-PR CI, merged deployment statuses, and read-only production
smoke. Until those are recorded, this report remains `IN PROGRESS` and does
not certify S08 as stable.
