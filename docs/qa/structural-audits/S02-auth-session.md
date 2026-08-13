# Structural audit: authentication and session lifecycle

- Date: 2026-08-13
- Auditor: Codex
- Base/final commit: `899336e` / `fb098a0`
- Environment: local source review, Vitest/JSDOM, optimized Next build, npm advisory service, GitHub Actions PHP 8.4/Laravel/SQLite and Chromium, production read-only HTTP
- Risk tier: A
- Dependencies: S00, S01
- Data classification: credentials, browser sessions, CSRF tokens, mobile bearer/refresh tokens, account identity, email verification, and password recovery audit events
- Production restrictions: read-only guest HTTP smoke only; no real login, registration, password reset, verification, token issuance, or account mutation

## Result

Status: STABLE

All verified findings are fixed. Local gates, required GitHub Actions, merge,
Vercel/Railway deployment, and read-only production smoke passed for merge
commit `fb098a0`.

## Inventory

- Public dentist and isolated admin login; self-service dentist registration; Google sign-in/link/unlink
- Sanctum browser sessions, CSRF bootstrap/retry, logout overlay, cache clearing, multi-tab auth broadcast, and protected-route proxy gates
- Native access/refresh token issue, rotation, abilities, expiry, per-device revocation, and logout
- Forced password rotation, self-service password change, forgot/reset password, reset-link routing, and session/PAT revocation
- Signed email verification, resend throttling, unverified-data gate, and abandoned-account retention contract
- Auth routes/middleware, runtime production policy, OpenAPI contract, release configuration, unit/feature tests, and browser journeys

## Layer coverage

| Layer | Status | Evidence/notes |
| --- | --- | --- |
| Product contract | PASS | Active frontend surfaces are the contract: public registration and Google auth remain supported; recovery, verification, portal separation, and forced-rotation behavior are documented in OpenAPI/release evidence. |
| UX and states | PASS | Login/register/recovery/verification states, bounded Google loading, logout overlay, session-expiry routing, errors, and retry paths were reviewed; a real-session logout browser regression was added. |
| Frontend architecture | PASS | Auth state, query-cache clearing, CSRF retry, client logout markers, cross-tab broadcast, and safe post-login destinations remain centralized and covered. |
| API contract | PASS | Every active auth route is now required by the 62-path OpenAPI validator; credential bounds, status codes, cookie/bearer security, and the legacy refresh-token alias are explicit. |
| Authorization and privacy | PASS | App/admin portal separation, active account/owner chain, roles, email-verification gate, forced-password allow-list, Google identity binding, generic recovery response, and non-PII audit metadata were verified server-side. |
| Data integrity | PASS | Refresh rotation locks and consumes the persisted token inside one transaction; password resets revoke browser/PAT access; password changes preserve only the current authenticated context and rotate its identifiers. |
| Performance | PASS | No dependency or browser request was added; refresh locking is scoped to one indexed token row and user transformation happens after the transaction. |
| Operations | PASS | Production boot/preflight rejects invalid or misaligned HTTPS frontend, CORS, and Sanctum origins; config-cached backend tests and all Vercel/Railway deploy statuses passed. |
| Accessibility/responsive/i18n | PASS | Auth unit coverage and the expanded `/reset-password`/`verify-email` WCAG/responsive matrix passed in Laravel-backed Chromium on desktop, 390x844 mobile, and 768x1024 tablet. |
| Verification | PASS | Local lint/typecheck/build/496 tests/guardrails/OpenAPI/npm audit and required backend/frontend/security/browser CI passed; deployed guest-only production smoke passed. |

## Findings

| ID | Severity | Finding | Evidence | Fix/test | Status |
| --- | --- | --- | --- | --- | --- |
| S02-001 | P1 | Forgot-password queried a nonexistent `users.deleted_at` column, so PostgreSQL could return 500 for the primary recovery flow while SQLite masked the schema error. | User model/migrations and `AuthController::forgotPassword`. | Filter by the real `account_status != deleted` contract; feature regression resolves and audits a known active account. | FIXED |
| S02-002 | P1 | Mobile refresh used find-then-delete without a row lock, allowing concurrent requests to validate the same single-use refresh token. | Previous `PersonalAccessToken::findToken` rotation sequence. | Resolve hash/id token formats under `lockForUpdate` and rotate the device pair in one DB transaction; existing old-token replay regression remains authoritative. | FIXED |
| S02-003 | P1 | Password reset URLs read `env()` at runtime, which is unsafe after Laravel `config:cache`; production also did not fail closed on an insecure or CORS/Sanctum-misaligned frontend origin. | `AppServiceProvider` URL callback and runtime policy. | Read the canonical configured origin, normalize whitespace, require valid HTTPS origins, and assert every frontend origin is represented by CORS and Sanctum; unit regressions cover canonical URL and drift. | FIXED |
| S02-004 | P2 | Google ID tokens and mobile refresh tokens had no request-size boundary. | Auth request validation and client limits. | Add 8192/255-character server bounds and matching OpenAPI constraints; oversized-payload feature regressions added. | FIXED |
| S02-005 | P2 | Anonymous password-reset completion logged the submitted email and attributed the action to the target user, creating unnecessary PII and a false authenticated actor. | Password-reset audit event. | Remove email metadata, keep target/tenant/IP/UA, and record a null actor; regression asserts tenant visibility, target, null actor, and null metadata. | FIXED |
| S02-006 | P2 | Self-service password change revoked other sessions but retained the current pre-change session ID and CSRF token. | `AuthService::changePassword`. | Rotate the surviving browser session and CSRF token after revocation; focused service regression added. | FIXED |
| S02-007 | P3 | Development mock logout left `mock_user_id`, so a subsequent local identity could inherit stale mock state. | Next mock logout route. | Expire all three mock identity cookies and cover their `Set-Cookie` headers. | FIXED |
| S02-008 | P2 | OpenAPI omitted active auth routes and the release checklist contradicted the visible public-registration contract. | Contract validator and release documentation. | Document/require all current auth endpoints and schemas; align registration and origin policy documentation. | FIXED |
| S02-009 | P2 | The mandatory browser suite did not prove a real Laravel logout revokes the protected session, nor scan reset/verification result pages for WCAG issues. | Existing critical/accessibility E2E inventory. | Add logout -> login -> protected-route rejection journey and include reset/verification pages in accessibility/responsive coverage. | FIXED |
| S02-010 | P2 | `/verify-email` exposed its heading and content without a semantic `main` landmark, found when the expanded browser matrix scanned the route. | First PR browser run: 15 journeys passed; all four failures identified the missing `main` on `/verify-email?status=invalid`. | Promote the page wrapper to `main` and assert the landmark in the component regression. | FIXED |

## Commands and environments

```text
npm run lint
npm exec tsc -- --noEmit
npm test                                  # 84 files, 496 tests
npm exec vitest -- <auth-focused files>  # 5 files, 14 tests after final browser additions
npm run check:core-guardrails
npm run check:openapi                     # 62 paths
npm run build                             # Next 16.2.11, 58 static/dynamic route entries
npm audit --audit-level=high              # 0 vulnerabilities
git diff --check
```

No supported local PHP 8.4 binary was installed and Docker Engine was not
running, so the repository's required GitHub Actions supplied the authoritative
backend/migration, Composer audit, and Laravel-backed Playwright evidence.
PR run `31713053356` passed all four jobs after the browser gate found and
verified the `/verify-email` landmark fix.

## Production smoke

Post-deploy read-only smoke for `fb098a0`:

- `/login`, `/register`, `/forgot-password`, `/reset-password?token=invalid...`,
  `/verify-email?status=invalid`, and `/admin/login` -> 200 with CSP, HSTS, and
  `X-Robots-Tag: noindex, nofollow, noarchive`
- `/dashboard` as guest -> 307 to `/login?from=%2Fdashboard`, with CSP/HSTS/noindex
- `https://api.identa.uz/api/v1/health` -> 200 with API CSP and HSTS
- Vercel, both Railway app/API services, subscription cron, and account-cleanup
  cron reported success for the same merge commit

## Blocked, accepted, or not tested

- No production login/logout, registration, verification, recovery email,
  password mutation, mobile token, or cleanup action was performed.
- Google provider success/failure remains covered with a fake identity service
  in backend tests; no real Google credential was requested or exposed.
- Firefox/WebKit and manual screen-reader speech are outside the current CI
  browser matrix and remain route-level S19 evidence, not an open S02 defect.

## Reopen triggers

- Changes to auth pages, auth client/store/broadcast/session-expiry helpers,
  proxy gates, auth API routes/controller/service/middleware, User identity or
  session/PAT schema, Google verification, email verification, cleanup, reset
  notifications, CORS/Sanctum/session/runtime configuration, or auth OpenAPI
- Laravel/Sanctum/Next/React Query auth dependency advisory or upgrade
- Login/logout loop, 419 cluster, reset/verification delivery failure, token
  replay, cross-portal access, inactive-owner access, or auth 5xx incident

## Final verification

Authentication now has bounded and documented public inputs, config-cache-safe
HTTPS recovery destinations, aligned production CORS/Sanctum origins, atomic
single-use mobile refresh rotation, correct anonymous recovery audit identity,
session/CSRF rotation after password changes, complete mock logout cleanup, and
Laravel-backed logout/WCAG/responsive regression coverage. Required CI, merge,
all deployment statuses, and read-only production smoke passed at `fb098a0`;
S02 is closed as STABLE.
