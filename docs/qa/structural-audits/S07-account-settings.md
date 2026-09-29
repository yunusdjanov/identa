# Structural audit: account settings and security

- Date: 2026-09-29
- Auditor: Codex
- Base/final commit: `a662e51` / audit branch pending CI and deployment
- Branch: `audit/s07-settings-security`
- Environment: local source review, Vitest/JSDOM, optimized Next build, npm 10 clean install and dependency audit; GitHub Actions, Vercel, Railway, and production smoke pending
- Risk tier: A
- Dependencies: S02
- Roles and tenants: dentist owner, assistant, platform admin; account settings are self-scoped and practice fields remain dentist-only
- Data classification: login identity, email-verification state, phone, practice/address/license profile data, working hours, display preferences, password state, Google identity binding, sessions/tokens, and privacy-minimized audit metadata
- Production restrictions: no real profile/email/password/Google mutation, no session revocation test, no verification email send, no database write, and no destructive fault injection; production verification is read-only

## Result

Status: IN PROGRESS

All reproduced local S07 defects are fixed and local mandatory gates pass. The
section remains in progress until required GitHub CI succeeds, the protected PR
is merged, both runtimes deploy the audited commit, and read-only production
smoke confirms the deployed account-recovery boundaries.

## Inventory

- Dentist/assistant Settings tabs: personal profile, practice, working hours,
  display preference, password security, and connected accounts
- Admin account settings, forced-password-reset recovery, email-verification
  recovery boundary, and privileged admin navigation gate
- Laravel profile request/controller/service, auth password and Google-link
  services, session/token revocation, role and verification middleware, audit
  logging, user/session/token persistence, and translations
- Local Next mock auth/profile/password routes, shared mock user state, API
  client/types/query cache, OpenAPI, loading/error states, and regression tests
- Google Identity Services loader/render/retry behavior, unlink protection, and
  password-fallback invariant

## Layer coverage

| Layer | Status | Evidence/notes |
| --- | --- | --- |
| Product contract | PASS | Account email is an identity change, not a cosmetic field: it now requires current-password proof, resets verification, unlinks the old Google identity, and revokes other credentials. Practice settings remain dentist-only. |
| UX and states | PASS | Email-change consequences and password requirement are explicit; phone can be cleared; failed optimistic display updates roll back; unsaved forms warn; Google unlink requires confirmation; GSI failure has a bounded retry state. |
| Frontend architecture | PASS | Successful profile mutations seed the query cache with the returned profile before revalidation; form state stays local; shared GSI loading replaces duplicate polling; no dependency was added. |
| API contract | PASS | Role filtering, validation limits/nullability, partial working-hours validation, email-change confirmation, response fields, cookie/bearer auth, mocks, and OpenAPI are aligned. |
| Authorization and privacy | PASS | Settings remain self-scoped. Unverified admins may reach account recovery but cannot call privileged admin APIs. Audit metadata records role and changed field names without old/new PII. |
| Data integrity | PASS | Profile write and audit append are atomic under a locked user row. Partial hours compare against persisted counterparts. Email identity cleanup and other-session revocation are in the same service workflow. No migration is required. |
| Performance | PASS | Profile endpoints remain single-row operations; no growing list or N+1 path was introduced. Google SDK loading is lazy, bounded, and shared. |
| Operations | N/A | S07 adds no queue, cron, storage, or schema dependency. CI/deployment/production verification is pending before closure. |
| Accessibility/responsive/i18n | PASS | Icon-only mobile tabs have accessible names, mobile actions fill available width, new security/range/confirmation copy exists in ru/uz/en, and existing responsive card patterns are retained. |
| Verification | IN PROGRESS | Focused regressions, 531-test frontend suite, lint, typecheck, OpenAPI, guardrails, production build, clean npm 10 install, and dependency audit pass. Backend CI and post-deploy production smoke remain. |

## Findings

| ID | Severity | Finding | Evidence | Fix/test | Status |
| --- | --- | --- | --- | --- | --- |
| S07-001 | P1 | A logged-in browser could change the login email without proving the current password; other sessions/tokens and the Google identity bound to the old email remained active. | Profile service accepted `email` as an ordinary profile field. | Require current-password proof only for an actual email change; reset verification/provider/Google binding/remember token, revoke other browser sessions and PATs while preserving the confirmed current credential, rotate the browser session, and add Laravel regressions. | FIXED |
| S07-002 | P1 | Resetting an admin email verification flag did not block privileged admin APIs. | The admin middleware chain lacked `email.verified`, and the admin client gate had no unverified boundary. | Add server middleware and mock parity; route unverified admins to account settings while keeping `/auth/me`, profile correction, password change, and resend recovery available; add backend/layout tests. | FIXED |
| S07-003 | P2 | Profile audit writes were outside the profile transaction and retained raw before/after email, phone, address, and license values. | Service snapshot and audit metadata inspection. | Append the audit inside the locked transaction and retain only actor role plus changed field names; add metadata assertions. | FIXED |
| S07-004 | P2 | Updating only one working-hours field validated only request-local values, allowing a range invalid against the stored counterpart. | Partial request path skipped the two-field comparison. | Combine submitted and persisted values, require a complete pair, enforce end after start in Laravel/mock/frontend, and add regressions. | FIXED |
| S07-005 | P2 | Optional phone could not be cleared, display preference stayed optimistic after failure, and successful mutation revalidation could briefly restore stale profile data. | UI payload/cache/error-path review. | Send explicit `null`, roll back failed optimistic state, seed cache from the mutation response, and add UI tests. | FIXED |
| S07-006 | P2 | Connected accounts duplicated the GSI loader, could poll indefinitely, and could strand the connect button after link/unlink; Google unlink had no confirmation. | Component lifecycle and loader comparison. | Reuse the bounded shared GSI hook with retry, render into each new mount, and add a confirmation dialog plus password-fallback tests. | FIXED |
| S07-007 | P2 | Local profile/password mocks validated after mutation or skipped production validation/persistence, so development behavior could disagree with Laravel. | Next mock route inspection. | Validate before mutation, persist role-allowed fields and password state, mirror email/working-hours rules, privacy-minimize audit metadata, and add route tests. | FIXED |
| S07-008 | P2 | The OpenAPI profile schema omitted display preference, nullability/limits, bearer access, role scope, and email-change confirmation semantics. | Runtime/request/resource comparison with the schema. | Align path descriptions/security and profile/update schemas; 68-path contract validation passes. | FIXED |
| S07-009 | P2 | The dependency gate found the newly disclosed `undici` WebSocket decompression DoS advisory through JSDOM. | `npm audit` reported GHSA-3wwx-pv8p-q78v for `undici 7.29.0`. | Update only the transitive lock entry to patched `7.30.0` with repository-pinned npm 10; clean install and audit report zero vulnerabilities. | FIXED |

## Commands and environments

```text
npm 10 clean install                         # 725 packages, reproducible lock
npm audit --audit-level=moderate             # 0 vulnerabilities
npm run lint                                 # pass, no warnings
npm exec tsc -- --noEmit                     # pass
npm test                                     # 92 files, 531 tests
focused S07 tests                            # 6 files, 25 tests
npm run check:core-guardrails                # pass
npm run check:openapi                        # 68 paths
npm run build                                # optimized build, 58 static pages generated
git diff --check                             # pass
```

No supported local PHP 8.4 runtime is installed. The complete Laravel suite,
fresh-database migrations, and backend syntax/static checks are therefore
mandatory GitHub Actions evidence before merge.

## Production smoke

Pending protected-PR merge and deployment. Only guest-safe/read-only checks
will be used: deployment commit/status, public shell, unauthenticated API
boundaries, API health, and verification-recovery routing. No real account
setting will be changed.

## Blocked, accepted, or not tested

- Required backend CI, Vercel/Railway deployment status, and read-only
  production smoke are pending; this is why the section is not yet `STABLE`.
- Correct-password, wrong-password, token/session revocation, audit privacy,
  and transaction behavior are covered in Laravel feature tests but await the
  authoritative PHP 8.4 CI runtime.
- A real Google account was not linked/unlinked and a real verification email
  was not sent. Those are intentionally excluded from production audit writes.
- Manual Firefox/WebKit, zoom, screen-reader speech, and exhaustive viewport
  breadth remain owned by S19; S07-specific accessible names and responsive
  controls are covered locally.

## Reopen triggers

- Changes to profile fields, verification, current-password rules, password
  reset/change, Google binding, auth provider selection, session/token
  revocation, or audit metadata
- Changes to dentist/assistant/admin role filtering, settings recovery routes,
  unverified access middleware, mobile bearer compatibility, or query caching
- Changes to working-hours or appointment configuration contracts
- Relevant auth/dependency advisory, unauthorized admin access, identity
  mismatch, session-revocation failure, or production settings incident

## Final verification

Local remediation is complete and all local mandatory gates pass. S07 will be
closed only after required CI and both production runtimes confirm the exact
deployed commit with read-only smoke.
