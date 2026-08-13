# Structural audit: shared frontend shell

- Date: 2026-08-13
- Auditor: Codex
- Base/final commit: `f2aa923` / pending merge commit
- Environment: local source review, Vitest/JSDOM, local Chromium with the development-only Next mock API, production build, production read-only HTTP
- Risk tier: A
- Dependencies: S00
- Data classification: shared session state and patient/finance navigation; no patient or financial records were read or mutated during this audit
- Production restrictions: read-only responses and redirects only

## Result

Status: STABLE (pending required CI, merge, deploy, and post-deploy smoke)

## Inventory

- Root, auth, protected, and admin App Router layouts and metadata boundaries
- Shared Query, server/client i18n, and client runtime providers
- Dentist/assistant and admin headers, navigation, account/language controls, logout overlay, banners, and loading skeletons
- Route/global error, not-found, forbidden, and access-denied states
- CSP/noindex proxy and Next response-header contracts
- `ru`, `uz`, and `en` dictionaries and locale switching
- Responsive, WCAG, keyboard bypass, and route-title regression suites

## Layer coverage

| Layer | Status | Evidence/notes |
| --- | --- | --- |
| Product contract | PASS | One protected layout owns dentist/assistant providers and shell; one admin layout owns the privileged access gate. |
| UX and states | PASS | Auth/protected/admin loading, logout, route/global errors, retry, access-denied, and stale-runtime recovery are present and covered. |
| Frontend architecture | PASS | Query providers are shared per route boundary; locale commits are atomic and latest-request-wins. |
| API contract | N/A | No backend/public API contract changed; locale dictionaries remain the only first-party shell route. |
| Authorization and privacy | PASS | Protected/admin children remain gated before mount; document titles do not include patient names or identifiers. |
| Data integrity | N/A | No persistence, finance calculation, or schema behavior changed. |
| Performance | PASS | Protected navigation retains its shared query client; no dependency or new network call was added. |
| Operations | PASS | Optimized Next build succeeds; production mock API remains canonical-host hard-blocked. |
| Accessibility/responsive/i18n | PASS | Shared skip links target focusable main landmarks; localized section titles and atomic `ru`/`uz`/`en` changes are covered; WCAG and responsive browser smoke passed in tested routes/viewports. |
| Verification | PASS | Focused tests, lint, typecheck, build, guardrails, Chromium E2E, and read-only production smoke provide current evidence. |

## Findings

| ID | Severity | Finding | Evidence | Fix/test | Status |
| --- | --- | --- | --- | --- | --- |
| S01-001 | P2 | Private/auth/admin routes inherited landing social metadata; protected/admin routes also lacked a safe section-specific browser title. | Layout metadata source and regression test. | Private boundaries clear landing description/keywords/canonical/social metadata, enforce noindex, and synchronize localized non-identifying route titles. | FIXED |
| S01-002 | P2 | Dentist/assistant and admin navigation had no keyboard bypass; normal admin dashboard content and loading shell lacked a shared focus target. | DOM/unit tests and Chromium accessibility tree. | Localized skip link plus focusable `#main-content` landmarks on every shared/admin state. | FIXED |
| S01-003 | P2 | Locale state changed before the requested dictionary arrived; a failed or out-of-order request could leave `html[lang]` inconsistent with visible copy. | Failing provider regression reproduced both mismatch and failure retention. | Dictionary and locale now commit atomically with a request-generation guard. | FIXED |

## Commands and environments

```text
node 22.23.1
eslint .
tsc --noEmit
next build --webpack
node scripts/check-core-guardrails.mjs
vitest focused shared-shell/provider/metadata/error/skeleton/admin suites
playwright shared-shell.spec.ts (Chromium, local Next mock API)
playwright accessibility.spec.ts + responsive.spec.ts (Chromium desktop, 390x844 mobile, 768x1024 tablet; see limitation below)
```

Focused unit/component evidence: 68 passing assertions across metadata, title, i18n, shell, admin gate, error/runtime, dictionary, and skeleton suites. The full Vitest gate passed 83/83 files and 495/495 tests; the shared-shell Chromium regression is 2/2 passing.

The broader browser run passed all three WCAG groups plus public/admin responsive coverage on desktop/mobile/tablet. Its dentist analytics responsive step could not reach the radiogroup because the frontend-only mock API has no `/analytics/summary` fixture; the page rendered its intended error/retry state without horizontal overflow. The ordinary full E2E config could not start on this workstation because no local PHP binary is installed; CI remains the authoritative Laravel-backed browser gate.

## Production smoke

Pre-change read-only baseline:

- `https://identa.uz/` -> 200
- `https://identa.uz/admin/analytics` -> authenticated redirect to `/admin/login`
- `https://api.identa.uz/api/v1/health` -> 200

Post-deploy smoke is pending merge/deployment and must repeat only read-only requests plus metadata/header inspection.

## Blocked, accepted, or not tested

- Safari/Firefox manual rendering and screen-reader speech output were not manually tested locally; CI's configured browser gate and WCAG automation remain required before merge.
- No production authentication, patient data, finance data, mutation, upload, migration, queue, or cron action was performed.
- The historical `docs/qa/page-audits/shared-shell.md` is superseded by this current structural report; its prior P2 findings are closed here.

## Reopen triggers

- Changes to root/auth/protected/admin layouts, Query/I18n/ClientRuntime providers, shared headers/navigation/account controls, error boundaries, skeleton shell, dictionaries, route metadata, proxy, CSP, or noindex rules
- Next.js, React Query, Radix, i18n, routing, or accessibility dependency change
- Shell/session/navigation incident, stale-chunk loop, focus regression, localization mismatch, indexing leak, or production metadata drift

## Final verification

The shared shell has one provider boundary per portal, centralized access gates, localized and privacy-safe route titles, keyboard bypass targets across normal/error/loading states, atomic locale switching, current error/recovery coverage, and a successful optimized production build. Mark STABLE only after required CI passes and the deployed merge commit completes read-only smoke.
