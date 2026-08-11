# Identa Page Audit Tracker

- Inventory last verified: 2026-08-11
- Total routed pages: 29
- Standard: `docs/qa/PAGE_AUDIT_STANDARD.md`
- Structural program: `docs/qa/STRUCTURAL_AUDIT_TRACKER.md`
- Cross-cutting text/layout/PDF audit:
  `docs/qa/TEXT_LAYOUT_PDF_AUDIT_2026-07-28.md`

Risk tiers:

- `A`: auth, patient/clinical, payment/billing, security settings, or privileged admin data
- `B`: core operational/dashboard/team workflows
- `C`: public and system/error pages

Recommended sequence follows shared dependencies and business risk. A page is
not marked `READY` until its report satisfies the master standard.

Recorded statuses below belong to the commit/environment named in each report.
They are historical evidence when that commit predates the current structural
baseline and must be revalidated before they establish current readiness.

| Order | Route | Tier | Primary focus | Status | Report |
| ---: | --- | :---: | --- | --- | --- |
| 1 | `/login` | A | Session login, validation, enumeration, mobile/keyboard | BLOCKED | `docs/qa/page-audits/login.md` |
| 2 | `/register` | A | Account creation, validation, trial setup | NOT STARTED | |
| 3 | `/forgot-password` | A | Enumeration resistance, recovery feedback | NOT STARTED | |
| 4 | `/reset-password` | A | Token lifecycle, password rotation, session revocation | NOT STARTED | |
| 5 | `/verify-email` | A | Signed/expired link and resend behavior | NOT STARTED | |
| 6 | `/settings` | A | Profile, password, connected accounts, privacy | NOT STARTED | |
| 7 | `/patients` | A | Tenant list, filters, pagination, create/export | NOT STARTED | |
| 8 | `/patients/[id]` | A | Patient identity, media, clinical/payment summary | NOT STARTED | |
| 9 | `/patients/[id]/history` | A | Clinical chronology, ownership, media/actions | NOT STARTED | |
| 10 | `/patients/[id]/odontogram` | A | Clinical editor integrity, persistence, touch/zoom | NOT STARTED | |
| 11 | `/payments` | A | Ledger, expenses, UZS/USD totals, filters/export | NOT STARTED | |
| 12 | `/payments/patients/[id]` | A | Patient finance identity, work/paid/debt reconciliation | NOT STARTED | |
| 13 | `/billing` | A | Subscription state, checkout/change/cancel | NOT STARTED | |
| 14 | `/appointments` | B | Calendar/list consistency, timezone, overlap | NOT STARTED | |
| 15 | `/dashboard` | B | Cross-widget consistency, navigation, refetch | NOT STARTED | |
| 16 | `/analytics` | B | Period/filter/currency correctness, chart accessibility | NOT STARTED | |
| 17 | `/team` | B | Staff ownership, limits, permissions, password reset | NOT STARTED | |
| 18 | `/staff` | B | Assistant workflow and permission-limited navigation | NOT STARTED | |
| 19 | `/admin/login` | A | Isolated admin authentication/session flow | NOT STARTED | |
| 20 | `/admin` | B | Privileged overview, counts, navigation | NOT STARTED | |
| 21 | `/admin/payments` | A | Billing records, refund integrity, permissions | NOT STARTED | |
| 22 | `/admin/plans` | A | Plan pricing/limits and destructive business impact | NOT STARTED | |
| 23 | `/admin/dentists/[id]/billing` | A | Subscription/payment lifecycle and auditability | NOT STARTED | |
| 24 | `/admin/dentists/[id]/staff` | A | Cross-account ownership and staff access | NOT STARTED | |
| 25 | `/admin/settings` | A | Admin profile/security behavior | NOT STARTED | |
| 26 | `/admin/analytics` | B | Global aggregation, currency, bounded queries | NOT STARTED | |
| 27 | `/` | C | Public landing, navigation, metadata, performance | NOT STARTED | |
| 28 | `/403` | C | Correct forbidden recovery and localization | NOT STARTED | |
| 29 | `/access-denied` | C | Correct access-denied recovery and localization | NOT STARTED | |

## Shared shell checks before page 1

- Root layout, authenticated layout, admin layout, sidebar, mobile navigation
- Global error and not-found boundaries
- Shared dialog, form, table, pagination, card, toast, and skeleton components
- Locale provider and `ru`/`uz`/`en` switching
- Session-expiry and request-error handling

Shared shell findings must be recorded separately and linked from every page
they affect.

Current shared-shell report: `docs/qa/page-audits/shared-shell.md` (`BLOCKED`).
Its P1 fix batch is complete locally; status remains blocked on mandatory
interactive coverage and open P2 findings.
