# Page audit: /login

- Date: 2026-07-26
- Auditor: Codex
- Commit/environment: `f6bc03e`, local source/tests + production read-only HTTP checks
- Source: `app/login/page.tsx`
- Risk tier: A
- Allowed roles: guest; valid dentist/assistant session redirects to `/dashboard`;
  valid admin session redirects to `/admin`
- Data classification: account credentials, session state
- APIs: `/auth/csrf-token`, `/auth/login`, `/auth/google`, `/auth/me`

## Result

Status: BLOCKED

The two P1 navigation/auth-flow defects are fixed locally with regression
coverage. Full runtime responsive, keyboard, focus, Google iframe, and
valid-credential login checks remain blocked because the browser-control
connection is unavailable.

## Coverage

| Area | Status | Evidence/notes |
| --- | --- | --- |
| Business/data | PASS | Safe protected destinations, including query state, are restored after login. |
| States/recovery | FAIL | Google script failure has no bounded timeout, retry, or accessible error state. |
| Responsive/visual | BLOCKED | Existing overflow smoke test inspected; mandatory viewport/zoom matrix not run. |
| Accessibility | FAIL | No `h1`; field errors are not programmatically associated or focus-managed. |
| Security/privacy | PASS | Portal separation, CSRF, session regeneration, throttling, generic invalid credentials, and cache clearing are present. |
| API/state/concurrency | PASS | Login mutation is non-retrying; pending state disables duplicate submit. |
| Performance | FAIL | Google readiness poll is unbounded if the third-party global never appears. |
| Localization | FAIL | Google button does not rerender after locale changes once initialized. |
| Tests/observability | FAIL | Existing tests cover only guest session probing and lazy Google loading, not the primary login outcomes or findings below. |

## Findings

| ID | Severity | Area | Finding | Evidence | Fix/test |
| --- | --- | --- | --- | --- | --- |
| LOGIN-001 | P1 | Navigation/business | FIXED locally (2026-07-26). Protected pathname and query state are preserved in `from`; password and Google success resolve it through a strict protected-route allowlist. External, protocol-relative, public, auth, and admin-crossing destinations fall back safely. | `lib/auth/post-login-destination.ts`; `proxy.ts`; `app/login/page.tsx`; local HTTP confirmed `/patients/42?tab=history&currency=USD` redirects with the complete encoded destination. | Regression coverage in `lib/auth/post-login-destination.test.ts`, `proxy.test.ts`, and `app/login/page.test.tsx`. |
| LOGIN-002 | P1 | Email verification/auth | FIXED locally (2026-07-26). `/verify-email` is no longer in the authenticated app-route allowlist, so signed-link result states remain public and retain their status query. | Shared protected-route allowlist; local HTTP returned `200` for `/verify-email?status=success` with no auth cookie. | Production-style guest regression in `proxy.test.ts`. |
| LOGIN-003 | P2 | Accessibility/metadata | The visible login title is a `div` (`CardTitle`), not `h1`, and the document inherits the landing title/canonical. Next route announcements therefore lack a unique descriptive page title/heading. Production HTML confirms both conditions. | `app/login/page.tsx:307-313`; `components/ui/card.tsx:28-37`; root metadata only. | Add login layout metadata (`Sign in`) and render the card title as `h1`; add DOM/metadata tests. |
| LOGIN-004 | P2 | Form accessibility | Validation messages have no IDs, `aria-describedby`, `role="alert"`, or live region. Invalid submit shows a toast but does not focus the first invalid field. Screen-reader users may hear only “invalid” without the reason. | `app/login/page.tsx:317-356`, `293-302`. | Associate errors to inputs, announce the form error summary, and focus the first invalid field; add keyboard/a11y tests. |
| LOGIN-005 | P2 | Google state/recovery | After Google loading is requested, the app-owned button disappears. If the script/global fails, the replacement is only an `aria-hidden` overlay; there is no `error` handler, bounded retry count, timeout, or retry button. The code comment says approximately two seconds, but polling continues every 100 ms indefinitely. | `app/login/page.tsx:205-290`; `components/auth/google-auth-button.tsx:105-138`. | Add load error + timeout state, stop polling, keep an accessible retry control, and test blocked/failed/slow GSI. |
| LOGIN-006 | P2 | Input boundary/security | Frontend limits email/password to 255 characters, but `/auth/login` server validation has no maximum length. A hostile client can bypass HTML limits and send oversized credentials into email parsing/password verification. | `app/login/page.tsx:327,347`; `backend/app/Http/Controllers/Api/AuthController.php:99-104`. | Add explicit backend maximums consistent with the client and regression tests for oversized email/password payloads. |
| LOGIN-007 | P2 | Accessible authentication | Email/password inputs omit stable `name` attributes. `autocomplete` is present, but password-manager/form identification is less reliable and needs runtime validation against WCAG accessible-authentication expectations. | `app/login/page.tsx:321-353`; production HTML confirms no `name`. | Add `name="email"` and `name="password"`; run password-manager and keyboard smoke tests. |
| LOGIN-008 | P3 | Localization | Once Google GSI initializes, a locale change sets `googleReady` but does not call `renderButton` again, so the Google iframe can remain in the previous language. | `app/login/page.tsx:230-265`. | Re-render safely on locale change or document the fixed locale; add locale-switch test. |

## Verified strengths

- Password login explicitly uses the `app` portal; admin accounts are rejected
  server-side from this portal.
- Backend login regenerates the session and applies `throttle:20,1`.
- Invalid credentials use a generic error and failed-attempt audit logs omit the
  submitted email.
- CSRF is prefetched and re-ensured by the mutation path.
- Login clears cached tenant data before seeding the new identity.
- Multi-tab login/logout events synchronize auth state.
- Pending password/Google mutations disable password submit.
- Inputs have visible labels, appropriate types, `autocomplete`, limits, and an
  accessible password-visibility button.
- Google script loading is deferred until the user requests it.
- Auth skeleton represents both fields, remember/forgot row, submit, OAuth, and
  account link closely.
- Production response includes `X-Robots-Tag: noindex, nofollow, noarchive`.

## Viewports/locales/roles tested

- Viewports: BLOCKED
- Browsers: production HTTP only; interactive browser checks BLOCKED
- Locales: source review for `ru`, `uz`, `en`; runtime switching BLOCKED
- Roles: guest/dentist/assistant/admin behavior reviewed in frontend/backend code
- Data cases: empty inputs, invalid credentials contract, session redirect code,
  Google configured/unconfigured/loading code

## Commands run

```text
npm.cmd exec vitest -- run lib/auth/post-login-destination.test.ts proxy.test.ts app/login/page.test.tsx components/layout/app-layout.test.tsx lib/sentry-event-sanitizer.test.ts --maxWorkers=1
npm.cmd exec eslint -- app/login/page.tsx app/login/page.test.tsx components/auth/auth-page-shell.tsx components/auth/google-auth-button.tsx components/layout/app-layout.tsx components/providers/client-runtime.tsx proxy.ts
npm.cmd exec tsc -- --noEmit
npm.cmd run check:core-guardrails
npm.cmd run build
curl.exe -sS -D - -o NUL https://identa.uz/login
curl.exe -sS -D - -o NUL "https://identa.uz/verify-email?status=success"
curl.exe -sS -D - -o NUL "https://identa.uz/patients/123?tab=history"
curl.exe -sS -D - -o NUL "http://127.0.0.1:3000/verify-email?status=success"
curl.exe -sS -D - -o NUL "http://127.0.0.1:3000/patients/42?tab=history&currency=USD"
```

Targeted result after the P1 fix batch: 5 test files passed, 31 tests passed;
ESLint, TypeScript, core guardrails, and the production build passed.

## Blocked or not tested

- Successful production login with an approved test account
- 320/360/390/768/1024/1280/1440 visual checks
- 200%/400% zoom and mobile keyboard behavior
- Keyboard tab/focus order and screen-reader announcements
- Safari/WebKit and Firefox
- Google iframe success, failure, timeout, and locale switching
- Slow/offline/429/5xx runtime recovery

## Final verification

The P1 fix batch is code-ready, but the full page audit remains blocked on the
interactive browser matrix and the open P2 findings. Deploy verification should
repeat the protected-route and verification-status HTTP checks in production.
