# Shared shell audit

- Date: 2026-07-28
- Auditor: Codex
- Commit/environment: `f6bc03e`, local source review + production read-only HTTP checks
- Scope: root layout, authenticated shell, admin layout, auth shell, global
  errors, loading primitives, observability, and route proxy
- Risk tier: A (shared by every routed page)

## Result

Status: BLOCKED

The shared shell's two P1 findings and the text/layout-related P2 findings
SHELL-005 and SHELL-006 are fixed locally with regression coverage.
Runtime browser coverage remains blocked by the unavailable browser-control
connection; no responsive or keyboard item has been assumed to pass from code
inspection alone.

## Coverage

| Area | Status | Evidence/notes |
| --- | --- | --- |
| Business/data | PASS | Auth/tenant cache is cleared on login, logout, 401, and inactive-account paths. |
| States/recovery | PASS | Route/global error screens and logout feedback exist; auth skeleton closely mirrors the form. |
| Responsive/visual | BLOCKED | Code and existing E2E inspected; full viewport/zoom runtime matrix could not be run. |
| Accessibility | BLOCKED | Nav names/current state and reduced-motion behavior are fixed in source; runtime keyboard, zoom, and computed-style checks remain blocked. |
| Security/privacy | PASS | Sentry URL/query/path values and dynamic resource identifiers are redacted before send. |
| API/state/concurrency | FAIL | Query providers are recreated across top-level app route segments. |
| Performance | FAIL | Cross-segment navigation remounts the provider/shell and discards query cache. |
| Localization | PASS | Global errors now synchronize the document language and displayed copy for `ru`, `uz`, and `en`; dictionary parity and corruption guards pass. |
| Tests/observability | FAIL | Existing tests do not cover accessible nav names, path sanitization, route metadata, or reduced motion. |

## Findings

| ID | Severity | Area | Finding | Evidence | Fix/test |
| --- | --- | --- | --- | --- | --- |
| SHELL-001 | P1 | Accessibility/navigation | FIXED locally (2026-07-26). Desktop/tablet and mobile nav links now expose localized names and `aria-current="page"`; decorative icons are hidden from the accessibility tree. | `components/layout/app-layout.tsx`; DOM regression asserts both nav variants have names and current-page state. | Regression coverage in `components/layout/app-layout.test.tsx`; runtime 768 px screen-reader check remains blocked. |
| SHELL-002 | P1 | Privacy/observability | FIXED locally (2026-07-26). Browser Sentry strips URL query/fragment data and redacts numeric, UUID, ULID, long-hex, mock-prefixed, and patient-code path identifiers across request URLs, breadcrumb navigation fields, referrers, and transaction names. | `lib/sentry-event-sanitizer.ts`; `sentry.client.config.ts`. | Regression coverage includes frontend/API URLs, patient IDs/codes, breadcrumb fields, and request query strings. |
| SHELL-003 | P2 | Metadata/accessibility | Operational routes inherit the landing-page title, canonical URL, Open Graph data, and robots metadata. Production `/login` renders the landing title and canonical `/`. This weakens route announcements and produces incorrect metadata. | Only root/public error pages export metadata. Production HTML: title `Identa \| Dental practice...`, canonical `https://identa.uz`. | Add route-group metadata defaults plus unique titles for every page; keep private/auth routes noindex. |
| SHELL-004 | P2 | State/performance | Every top-level protected route owns a separate `QueryProvider` and `AppLayout`. Navigating between `/dashboard`, `/patients`, `/payments`, etc. remounts the provider, discards cache, repeats `auth/me`, and can replay shell skeletons. | Repeated layouts in `app/dashboard/layout.tsx`, `app/patients/layout.tsx`, `app/payments/layout.tsx`, and peers. | Move the shared provider/shell into a single route-group layout; add navigation test proving query cache and shell remain mounted. |
| SHELL-005 | P2 | Accessibility/motion | FIXED locally (2026-07-28). A global `prefers-reduced-motion: reduce` policy minimizes animation and transitions and disables smooth scrolling for users who request reduced motion. | `app/globals.css`. | Source/type/build verification is complete; computed-style browser verification remains blocked. |
| SHELL-006 | P2 | Accessibility/localization | FIXED locally (2026-07-28). The global error document and error copy now use one cookie-resolved locale, so the `<html lang>` attribute matches Russian, Uzbek, or English content. | `app/global-error.tsx`; `components/error/error-screen.tsx`. | Locale override regression added in `components/error/error-screen.test.tsx`; interactive announcement check remains blocked. |
| SHELL-007 | P2 | Auth/admin shell | The admin layout only swaps the logout overlay; authentication, role redirects, headers, and shell behavior are repeated inside individual admin pages. This permits inconsistent loading/redirect behavior and unnecessary privileged API attempts before client redirects, although backend role middleware still denies access. | `app/admin/layout.tsx:14-31`; repeated auth redirects in admin page tests/files. | Centralize admin auth/role state and shared shell in the admin layout; keep backend authorization unchanged. |
| SHELL-008 | P2 | Indexing/config drift | The `X-Robots-Tag` route list omits `/analytics` and `/verify-email`, while root metadata says `index, follow`. | `next.config.ts:121-158`; production `/verify-email` redirect response had no `X-Robots-Tag`. | Replace the fragile allowlist with public-route metadata or include every private/auth/system route; add header contract tests. |

## Verified strengths

- Production `/login` returns HTTPS, HSTS, CSP, referrer policy,
  permissions policy, `nosniff`, and `X-Robots-Tag: noindex`.
- Login/logout/session-expiry paths clear React Query and Zustand auth state.
- Mutation retries are disabled globally to avoid duplicate financial and
  create operations.
- Forced-password redirects block protected child components from mounting
  before the redirect.
- Route and global error screens have localized recovery actions and visible
  error digests.
- Production mock API paths are hard-blocked on the canonical host.

## Viewports/locales/roles tested

- Viewports: BLOCKED (runtime browser connection unavailable)
- Browsers: production HTTP only; interactive Chromium/WebKit/Firefox BLOCKED
- Locales: source review for `ru`, `uz`, `en`; runtime switching BLOCKED
- Roles: source/test review for guest, dentist, assistant, admin
- Data cases: auth/session/error state code paths

## Commands run

```text
npm.cmd exec vitest -- run lib/auth/post-login-destination.test.ts proxy.test.ts app/login/page.test.tsx components/layout/app-layout.test.tsx lib/sentry-event-sanitizer.test.ts --maxWorkers=1
npm.cmd exec eslint -- app/login/page.tsx app/login/page.test.tsx components/auth/auth-page-shell.tsx components/auth/google-auth-button.tsx components/layout/app-layout.tsx components/providers/client-runtime.tsx proxy.ts
npm.cmd exec tsc -- --noEmit
npm.cmd run check:core-guardrails
npm.cmd run build
curl.exe -sS -D - -o NUL https://identa.uz/login
```

## Blocked or not tested

- 320/360/390/768/1024/1280/1440 runtime screenshots
- 200%/400% zoom and reflow
- Keyboard order and visible focus
- WebKit and Firefox smoke tests
- Screen-reader route announcements
- Production browser Sentry/Vercel environment values

## Final verification

The P1 fixes and text/layout-related P2 fixes are code-ready. The shared-shell
audit remains blocked on the interactive viewport/keyboard matrix and the
remaining metadata, provider-layout, admin-shell, and indexing P2 findings.
