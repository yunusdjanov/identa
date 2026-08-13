# Structural audit: authentication and session lifecycle

- Date: 2026-08-13
- Auditor: Codex
- Base/final commit: `899336e` / pending CI, merge, and deploy
- Environment: local source review, Vitest/JSDOM, optimized Next build, npm advisory service; GitHub Actions Laravel/SQLite and Chromium gates pending
- Risk tier: A
- Dependencies: S00, S01
- Data classification: credentials, browser sessions, CSRF tokens, mobile bearer/refresh tokens, account identity, email verification, and password recovery audit events
- Production restrictions: read-only guest HTTP smoke only; no real login, registration, password reset, verification, token issuance, or account mutation

## Result

Status: IN PROGRESS

Implementation and local frontend gates are complete. The section remains in
progress until the authoritative PHP 8.4 backend suite, Laravel-backed browser
journeys, dependency audit, merge, deploy, and read-only production smoke pass.

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
| Operations | IN PROGRESS | Production boot/preflight now rejects invalid or misaligned HTTPS frontend, CORS, and Sanctum origins; PHP/config-cache behavior and deployment still require CI/deploy evidence. |
| Accessibility/responsive/i18n | IN PROGRESS | Auth unit coverage passes and `/reset-password` plus `/verify-email` were added to WCAG/responsive browser suites; Laravel-backed Chromium execution is pending CI. |
| Verification | IN PROGRESS | Lint, typecheck, build, 496 frontend tests, guardrails, OpenAPI, and npm audit pass locally; backend, E2E, Composer audit, merge, deploy, and production smoke are pending. |

## Findings

| ID | Severity | Finding | Evidence | Fix/test | Status |
| --- | --- | --- | --- | --- | --- |
| S02-001 | P1 | Forgot-password queried a nonexistent `users.deleted_at` column, so PostgreSQL could return 500 for the primary recovery flow while SQLite masked the schema error. | User model/migrations and `AuthController::forgotPassword`. | Filter by the real `account_status != deleted` contract; feature regression resolves and audits a known active account. | FIXED, CI PENDING |
| S02-002 | P1 | Mobile refresh used find-then-delete without a row lock, allowing concurrent requests to validate the same single-use refresh token. | Previous `PersonalAccessToken::findToken` rotation sequence. | Resolve hash/id token formats under `lockForUpdate` and rotate the device pair in one DB transaction; existing old-token replay regression remains authoritative. | FIXED, CI PENDING |
| S02-003 | P1 | Password reset URLs read `env()` at runtime, which is unsafe after Laravel `config:cache`; production also did not fail closed on an insecure or CORS/Sanctum-misaligned frontend origin. | `AppServiceProvider` URL callback and runtime policy. | Read the canonical configured origin, normalize whitespace, require valid HTTPS origins, and assert every frontend origin is represented by CORS and Sanctum; unit regressions cover canonical URL and drift. | FIXED, CI PENDING |
| S02-004 | P2 | Google ID tokens and mobile refresh tokens had no request-size boundary. | Auth request validation and client limits. | Add 8192/255-character server bounds and matching OpenAPI constraints; oversized-payload feature regressions added. | FIXED, CI PENDING |
| S02-005 | P2 | Anonymous password-reset completion logged the submitted email and attributed the action to the target user, creating unnecessary PII and a false authenticated actor. | Password-reset audit event. | Remove email metadata, keep target/tenant/IP/UA, and record a null actor; regression asserts tenant visibility, target, null actor, and null metadata. | FIXED, CI PENDING |
| S02-006 | P2 | Self-service password change revoked other sessions but retained the current pre-change session ID and CSRF token. | `AuthService::changePassword`. | Rotate the surviving browser session and CSRF token after revocation; focused service regression added. | FIXED, CI PENDING |
| S02-007 | P3 | Development mock logout left `mock_user_id`, so a subsequent local identity could inherit stale mock state. | Next mock logout route. | Expire all three mock identity cookies and cover their `Set-Cookie` headers. | FIXED |
| S02-008 | P2 | OpenAPI omitted active auth routes and the release checklist contradicted the visible public-registration contract. | Contract validator and release documentation. | Document/require all current auth endpoints and schemas; align registration and origin policy documentation. | FIXED |
| S02-009 | P2 | The mandatory browser suite did not prove a real Laravel logout revokes the protected session, nor scan reset/verification result pages for WCAG issues. | Existing critical/accessibility E2E inventory. | Add logout -> login -> protected-route rejection journey and include reset/verification pages in accessibility/responsive coverage. | FIXED, CI PENDING |
| S02-010 | P2 | `/verify-email` exposed its heading and content without a semantic `main` landmark, found when the expanded browser matrix scanned the route. | First PR browser run: 15 journeys passed; all four failures identified the missing `main` on `/verify-email?status=invalid`. | Promote the page wrapper to `main` and assert the landmark in the component regression. | FIXED, CI PENDING |

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

No supported local PHP 8.4 binary is installed and Docker Engine was not
running, so backend tests, migrations, Composer audit, and Laravel-backed
Playwright are intentionally delegated to the repository's required GitHub
Actions jobs rather than simulated with a different runtime.

## Production smoke

Pending merge and successful Vercel/Railway deployment. The smoke will be
guest/read-only and limited to auth page headers/noindex, protected redirects,
and API health; no real credential or recovery action will be submitted.

## Blocked, accepted, or not tested

- PHP 8.4 backend tests and Laravel-backed Chromium are pending GitHub Actions.
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

Pending required CI, merge, deployment status, and read-only production smoke.
