# Identa Page Audit Standard

- Version: 1.0
- Date: 2026-07-25
- Scope: Identa Next.js frontend, the APIs used by each page, and role/tenant behavior

This is the mandatory checklist for auditing every page in Identa. The same
standard is used for public, dentist, assistant, and admin routes; high-risk
pages receive the additional checks in section 6.

## 1. Standards baseline

- Accessibility: [WCAG 2.2, Level AA](https://www.w3.org/TR/WCAG22/)
- Application security: [OWASP ASVS 5.0](https://github.com/OWASP/ASVS/tree/v5.0.0_release)
- Security risk model: [OWASP Top 10:2025](https://owasp.org/Top10/)
- Performance: [Core Web Vitals](https://web.dev/articles/vitals)
- Framework behavior: [Next.js App Router](https://nextjs.org/docs/app)
- Project rules: `docs/qa/CORE_QUALITY_RULES.md`

These are minimum baselines, not substitutes for Identa business-rule
verification.

## 2. Result and severity model

Every checklist item must be recorded as one of:

- `PASS`: verified with evidence
- `FAIL`: verified defect
- `N/A`: does not apply, with a short reason
- `BLOCKED`: could not verify because required data, role, environment, or tool is unavailable
- `NOT TESTED`: still pending

Defect severity:

| Severity | Meaning | Examples |
| --- | --- | --- |
| P0 Critical | Immediate security, privacy, clinical, or financial integrity risk | Tenant escape, account takeover, patient-data exposure, wrong payment persisted, irreversible wrong-record deletion |
| P1 High | Primary workflow or a supported role/device is unusable; serious data or accessibility failure | Save silently fails, mobile primary action inaccessible, totals/currency wrong, forced-password control bypass |
| P2 Medium | Secondary workflow, recovery state, responsive layout, or consistency defect | Filter loses state, skeleton shifts layout, tablet overflow, missing retry |
| P3 Low | Polish or low-impact content issue | Minor spacing, copy inconsistency, non-blocking alignment |

Page result:

- `BLOCKED`: at least one open P0/P1, or a mandatory security/business check is `BLOCKED`/`NOT TESTED`.
- `CONDITIONAL`: no P0/P1; only accepted P2/P3 follow-ups remain.
- `READY`: all mandatory checks pass and there are no unaccepted defects.

Do not use an average numeric score. A high average must never hide one
critical failure.

## 3. Audit preparation

Before opening the page, record:

- Route and source `page.tsx`
- Page purpose and primary user job
- Allowed roles and required permissions
- Tenant boundary and data owner
- APIs, queries, mutations, exports, and uploads used
- Data classification: public, account, patient, clinical, payment, or admin
- Page risk tier from `PAGE_AUDIT_TRACKER.md`
- Test accounts/data required
- Destructive actions that must not be exercised in production

Audit evidence must include:

- Browser and viewport
- Role/account used
- Screenshot or video for visual/responsive defects
- Request/response or code reference for API/security findings
- Exact reproduction steps
- Expected result and actual result
- Regression test added when a defect is fixed

## 4. Mandatory test matrix

### 4.1 Viewports and zoom

Run every page at:

- 320 × 568: WCAG reflow boundary
- 360 × 800: small Android
- 390 × 844: primary mobile
- 768 × 1024: tablet portrait
- 1024 × 768: tablet landscape/small desktop
- 1280 × 800: laptop
- 1440 × 900: desktop

Also verify:

- 200% browser zoom for all pages
- 400% zoom or equivalent 320 CSS px reflow for content pages
- Landscape mode for pages with forms, tables, charts, or sticky controls
- On-screen keyboard behavior for mobile forms

Horizontal scrolling is allowed only for a component whose meaning requires a
two-dimensional layout, such as a wide data table. The page shell itself must
not overflow horizontally.

### 4.2 Browsers and input

- Chromium desktop and touch/mobile
- Safari/WebKit smoke test for Tier A pages
- Firefox smoke test for Tier A pages
- Keyboard-only navigation
- Touch interaction for mobile/tablet
- Mouse/trackpad interaction

### 4.3 Locales and representative data

- Russian (`ru`), Uzbek (`uz`), and English (`en`)
- Empty dataset
- One record
- Enough records to paginate
- Long names, addresses, notes, and translations
- Missing optional values
- Maximum valid values
- UZS-only, USD-only, and mixed-currency data where finance is shown

## 5. Master page checklist

### A. Page contract and navigation

- [ ] Route is reachable only by the intended roles.
- [ ] Direct URL entry, refresh, back, forward, and deep-link navigation work.
- [ ] Unauthorized, forbidden, inactive-account, and expired-session outcomes are distinct and correct.
- [ ] Page has a unique, descriptive document title and one clear `h1`.
- [ ] Sidebar/tab active state, breadcrumb, and back action point to the correct location.
- [ ] Query parameters preserve shareable filter/sort/page state where appropriate.
- [ ] Browser back does not unexpectedly resubmit a mutation or lose committed data.
- [ ] External links use the correct security attributes and do not leak sensitive query data.

### B. Business and data correctness

- [ ] The primary user job succeeds end to end.
- [ ] Every displayed value comes from the intended record and tenant.
- [ ] Create, update, status transition, and delete rules match backend rules.
- [ ] Client checks and server checks agree; server validation remains authoritative.
- [ ] Dates, times, timezone, number separators, and rounding are correct.
- [ ] UZS and USD are never silently merged; totals, paid, debt, and balance use the correct currency.
- [ ] Zero, negative, partial-payment, overpayment, refund, and missing-value cases are handled where applicable.
- [ ] Search/filter/sort/pagination change only the intended collection; unrelated patient or payment summary cards remain stable.
- [ ] Refresh/refetch cannot replace newer data with an older response.
- [ ] Double click, Enter, retry, or slow network cannot create duplicate records or payments.
- [ ] Successful mutation invalidates only the required cached data and refreshes all affected totals.
- [ ] Cancel/close leaves persisted and unsaved data in the expected state.

### C. Loading, empty, error, and recovery states

- [ ] Initial load has an intentional loading boundary or immediate stable content.
- [ ] Skeleton structure matches the final layout closely enough to avoid layout shift.
- [ ] Skeletons do not show impossible controls/data and are hidden from assistive technology.
- [ ] Background refetch does not replace usable content with a full-page skeleton.
- [ ] Empty dataset and filtered-empty states have different, useful copy.
- [ ] Expected validation/API errors are shown near the affected action or field.
- [ ] Partial failure does not hide successfully loaded independent sections.
- [ ] Retry works and does not duplicate the original mutation.
- [ ] 401, 403, 404, 409/422, 429, offline, timeout, and 5xx behavior is intentional.
- [ ] Stale data is not presented as newly saved data.
- [ ] Success feedback is visible, localized, and does not disappear before it can be understood.
- [ ] Destructive actions require clear confirmation and provide recovery when practical.

### D. Responsive layout and visual consistency

- [ ] No unintended clipping, overlap, horizontal page overflow, or off-screen action.
- [ ] Header, sidebar, tabs, cards, tables, charts, dialogs, and drawers adapt at every required viewport.
- [ ] Sticky/fixed elements do not cover focused controls, errors, table rows, or the last page content.
- [ ] Long text wraps or truncates intentionally; the full value remains available when needed.
- [ ] Tables keep row/column meaning on mobile; responsive cards preserve the same information and actions.
- [ ] Dialogs and dropdowns fit the viewport and remain scrollable.
- [ ] Mobile keyboard does not hide the active input or submit action.
- [ ] Spacing, radii, typography, colors, icons, control heights, and card hierarchy use shared design conventions.
- [ ] Repeated blocks use the same shared component/design rather than page-specific near-copies.
- [ ] Icons match the action and are not the only source of meaning.
- [ ] Touch targets meet WCAG 2.2 AA minimum; primary/frequent Identa controls target at least 44 × 44 CSS px.
- [ ] Hover-only information/action has keyboard and touch alternatives.
- [ ] Content remains readable at 200% zoom and reflows without lost functionality at 320 CSS px.
- [ ] Motion respects `prefers-reduced-motion`.

### E. Accessibility (WCAG 2.2 AA)

- [ ] Semantic landmarks (`header`, `nav`, `main`, `aside`, `footer`) are correct and not duplicated incorrectly.
- [ ] Heading levels describe the page structure without skips caused only by styling.
- [ ] All functionality works with keyboard only.
- [ ] Focus order follows the visual/task order.
- [ ] Focus is clearly visible and is not obscured by sticky content.
- [ ] Dialog/drawer focus is trapped, initial focus is sensible, Escape works, and focus returns to the trigger.
- [ ] Every input has an accessible label, purpose, required state, and associated error.
- [ ] Authentication fields support password managers and appropriate `autocomplete`.
- [ ] Error summaries and status changes are announced without moving focus unexpectedly.
- [ ] Text contrast is at least 4.5:1; large text is at least 3:1.
- [ ] Controls, focus indicators, charts, and meaningful boundaries meet non-text contrast requirements.
- [ ] Information is not communicated by color, position, shape, or icon alone.
- [ ] Informative images have useful alt text; decorative images/icons are ignored by assistive technology.
- [ ] Data tables have proper headers and accessible names; charts have a text/table equivalent.
- [ ] Locale changes update the page language and screen-reader-visible text consistently.
- [ ] No keyboard trap, unexpected focus jump, or automatic context change occurs.

### F. Forms and interactions

- [ ] Initial values reflect persisted data exactly.
- [ ] Required/optional fields and accepted formats are clear before submit.
- [ ] Leading/trailing whitespace, Unicode, pasted text, and maximum lengths are handled.
- [ ] Validation runs at a useful time and does not erase user input.
- [ ] First invalid field receives focus after submit when appropriate.
- [ ] Submit has a pending state and cannot be triggered twice.
- [ ] Disabled and read-only are used correctly and remain understandable.
- [ ] Unsaved-change behavior is intentional for close, back, reload, and route change.
- [ ] Date/time/currency controls allow valid keyboard and mobile input.
- [ ] Destructive and financial confirmations repeat the affected entity and amount.
- [ ] Optimistic UI rolls back correctly on API failure.

### G. Security, authorization, and privacy

- [ ] Authentication, role, permission, subscription, and tenant ownership are enforced by the backend, not only hidden in UI.
- [ ] Changing route IDs, query parameters, or request body IDs cannot access another tenant/user.
- [ ] Read and mutation endpoints both deny unauthorized roles.
- [ ] CSRF/session/Bearer-token behavior matches the intended client.
- [ ] Forced password rotation, blocked/deleted accounts, and revoked sessions cannot mutate data.
- [ ] All untrusted inputs are server-validated syntactically and semantically.
- [ ] Output is context-encoded; unsafe HTML/URL injection is impossible.
- [ ] Sensitive patient/payment/admin data is absent from URLs, browser storage, analytics, console logs, and unsanitized error reports.
- [ ] Cache/query keys cannot leak one account or patient’s data into another session.
- [ ] Export/download endpoints re-check permission and tenant ownership and use safe filenames/content types.
- [ ] Uploads verify real stored type and size, enforce limits, and cannot expose predictable private URLs.
- [ ] Lists are bounded and paginated; search and mutation endpoints have appropriate throttling.
- [ ] Error responses do not expose SQL, stack traces, tokens, secrets, or unnecessary patient fields.
- [ ] Audit logs cover security-sensitive, patient, payment, export, and destructive actions without storing secrets.
- [ ] Logout, password reset/change, and privilege/status changes invalidate the intended sessions/tokens.

### H. API, state, and concurrency

- [ ] Request and response shapes match the documented API contract and TypeScript types.
- [ ] Loading/error/success state belongs to the correct query or mutation.
- [ ] Query keys include every data-shaping filter and tenant/resource identifier.
- [ ] Abort/unmount behavior prevents late responses from updating the wrong page.
- [ ] Parallel requests do not overwrite unrelated summary/profile sections.
- [ ] Pagination is bounded and metadata remains correct after mutations.
- [ ] Backend queries avoid N+1 behavior and unbounded in-memory aggregation.
- [ ] Conflict and validation responses are distinguishable and actionable.
- [ ] Money and clinical state transitions are transactional where partial persistence would be unsafe.
- [ ] Idempotency or equivalent duplicate protection exists for retryable critical mutations.

### I. Performance

- [ ] Field target at p75: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
- [ ] Initial page does not fetch the same resource repeatedly or create avoidable waterfalls.
- [ ] Large lists use server pagination; the browser does not pull every page to filter locally.
- [ ] Expensive charts, editors, and dialogs are loaded only when needed where practical.
- [ ] Images use appropriate dimensions, compression, lazy loading, and priority.
- [ ] Skeleton/final dimensions prevent layout shift.
- [ ] Search input is debounced/cancelled appropriately without dropping deliberate requests.
- [ ] Render loops, unstable dependencies, and broad global-state subscriptions are absent.
- [ ] Bundle impact is justified before adding a dependency.
- [ ] Slow API and low-end mobile behavior remain usable.

### J. Localization and content

- [ ] All user-facing strings are available in `ru`, `uz`, and `en`.
- [ ] No raw translation key, mixed-language fragment, or mojibake is visible.
- [ ] Long translations do not clip controls or break cards/tables.
- [ ] Dates and numbers follow the active locale while business currency remains explicit.
- [ ] Names, addresses, phone numbers, and free text preserve valid Unicode.
- [ ] Empty/error/success/destructive copy explains the next action clearly.
- [ ] Terminology is consistent across navigation, headings, forms, tables, and exports.

### K. Observability and maintainability

- [ ] Unexpected failures reach the approved error tracker with request correlation context.
- [ ] Sensitive payload fields are scrubbed before logging/reporting.
- [ ] Expected validation/auth errors are not reported as noisy server failures.
- [ ] Page-specific logic is localized; genuinely shared behavior uses shared components/hooks.
- [ ] No dead code, debug output, broad `any`, or unexplained magic business value is introduced.
- [ ] Loading/error/empty components reflect the same data contract as the page.
- [ ] Complex business rules and public API assumptions are documented near the code.

### L. Verification and regression coverage

- [ ] Relevant lint and TypeScript checks pass.
- [ ] Existing unit/component tests pass.
- [ ] Fixed defects have regression tests that fail on the old behavior.
- [ ] Tier A primary flows have API/feature coverage plus browser/E2E coverage where practical.
- [ ] Responsive checks cover at least mobile, tablet, and desktop automation.
- [ ] Accessibility automation is supplemented with keyboard/focus/manual checks.
- [ ] Production smoke checks are read-only or use explicitly approved test data.
- [ ] Audit report lists every command run and every check that could not be run.

## 6. Additional high-risk gates

### 6.1 Auth and settings

- Session fixation, stale session, refresh-token scope, logout pairing, password
  reset/change, forced rotation, email verification, Google link/unlink, and
  blocked/deleted account behavior must be verified.
- Login/reset responses must not enable account enumeration.
- Password managers, paste, and accessible authentication must work.

### 6.2 Patient and clinical pages

- Every API/media request must be dentist-tenant scoped.
- Direct patient ID changes must return 404/403 without revealing existence.
- Clinical history must preserve chronology, attribution, and immutable facts.
- Image view/edit/delete/upload paths must enforce ownership and real object
  validation.
- Patient data must not enter URL query strings, analytics, or unsanitized logs.

### 6.3 Payments, expenses, billing, and analytics

- UZS and USD must be calculated independently at every layer.
- `work total`, `paid`, `debt/balance`, refunds, expenses, and period filters
  must reconcile against source records.
- Filtering a ledger must not silently redefine unrelated patient/global
  summary cards unless the product contract explicitly says so.
- Financial writes must be validated, authorized, transactional, duplicate
  protected, and auditable.
- Export content, totals, currency, locale, filename, and permission must match
  the visible scope.

### 6.4 Admin and team pages

- Admin/dentist/assistant roles must be tested separately by direct API calls,
  not only by hidden buttons.
- Ownership/status/subscription/password changes must invalidate affected access
  immediately.
- Staff limits and permissions must be enforced under concurrent requests.
- Admin views must avoid exposing patient-level data unless explicitly required.

## 7. Per-page audit report template

Create `docs/qa/page-audits/<route-slug>.md`:

```md
# Page audit: <route>

Date:
Auditor:
Commit/environment:
Source:
Risk tier:
Allowed roles:
Data classification:
APIs:

## Result

Status: READY | CONDITIONAL | BLOCKED

## Coverage

| Area | Status | Evidence/notes |
| --- | --- | --- |
| Business/data | NOT TESTED | |
| States/recovery | NOT TESTED | |
| Responsive/visual | NOT TESTED | |
| Accessibility | NOT TESTED | |
| Security/privacy | NOT TESTED | |
| API/state/concurrency | NOT TESTED | |
| Performance | NOT TESTED | |
| Localization | NOT TESTED | |
| Tests/observability | NOT TESTED | |

## Findings

| ID | Severity | Area | Finding | Evidence | Fix/test |
| --- | --- | --- | --- | --- | --- |

## Viewports/locales/roles tested

- Viewports:
- Browsers:
- Locales:
- Roles:
- Data cases:

## Commands run

## Blocked or not tested

## Final verification
```

## 8. Audit completion rule

A page is complete only when:

1. Its report contains evidence for every mandatory area.
2. No P0/P1 remains open.
3. Required regression tests pass.
4. The tracker links to the report and records the final result.
5. Shared-component defects found on one page are rechecked on every affected
   page before the shared fix is marked complete.
