# Execution Board (Non-Deployment Track)

Last updated: 2026-03-11
Mode: Demo readiness and UI polish only (no deploy/launch tasks)

## Now (P0)

- [ ] Demo-critical localization integrity (RU/UZ/EN)
Acceptance criteria:
- [ ] No mojibake/encoding artifacts in navbar, headers, cards, tables, dialogs, and filters
- [ ] Date strings are locale-correct in RU/UZ/EN on dashboard and appointments
- [ ] No raw i18n keys visible in UI

- [ ] Hydration and header stability cleanup
Acceptance criteria:
- [ ] No React hydration mismatch in primary dentist/staff flows after refresh
- [ ] Header skeleton does not show mixed real+skeleton state during initial load
- [ ] Staff header identity remains stable on refresh (no temporary wrong role/name)

- [ ] Demo-surface visual defects cleanup
Acceptance criteria:
- [ ] No stray floating scroll/chevron artifacts on settings/staff pages
- [ ] No overlapping table header/cell text in payments/patients on 1366x768 and 1920x1080
- [ ] Long-text display remains clipped/wrapped intentionally without layout break

## Next (P1)

- [ ] Role-safe dashboard for assistants
Acceptance criteria:
- [ ] Assistant dashboard hides finance totals (revenue/debt)
- [ ] Assistant cards focus on operations (today pending, starting soon, canceled/no-show)
- [ ] Dentist dashboard remains unchanged for finance views

- [ ] Staff/Action Logs polish pass
Acceptance criteria:
- [ ] Staff list pagination is 10 items/page
- [ ] Action logs pagination is 10 items/page
- [ ] Labels are fully localized (including `User`, `Entity`, `Required permission`, pagination controls)

- [ ] Demo walkthrough path hardening
Acceptance criteria:
- [ ] End-to-end demo path is smooth: Login -> Dashboard -> Patients -> Appointments -> Payments -> Staff
- [ ] Every route in path has clean loading/empty/error states
- [ ] No blocking runtime/network errors in happy path

## Later (P2)

- [ ] UI-system cleanup and consistency debt
Acceptance criteria:
- [ ] Duplicate style decisions converted to shared variants/tokens where practical
- [ ] Modal/button/input/table patterns are consistent across all primary pages
- [ ] Remaining UI exceptions documented with rationale

- [ ] Deep hardening lane (post-demo)
Acceptance criteria:
- [ ] Expand focused regression tests for localization and hydration-sensitive components
- [ ] Add visual diff checks for critical pages in CI
- [ ] Extend role-based visibility tests for assistant vs dentist UI surfaces

## Completed Lanes (Reference)

- [x] Security and release preflight baselines
- [x] Critical a11y consistency pass (appointments/patients/payments)
- [x] Error-state and empty-state consistency cleanup
- [x] Billing/category behavior coverage expansion
- [x] Architecture and performance optimization slices (local scale)
