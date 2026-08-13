# Identa Layered Structural Audit Tracker

- Program start: 2026-08-11
- Current baseline commit: `fb098a0`
- Standard: `docs/qa/STRUCTURAL_AUDIT_STANDARD.md`
- Route inventory: 29 pages in `docs/qa/PAGE_AUDIT_TRACKER.md`
- Default production policy: read-only smoke

This tracker is the source of truth for the current project-wide audit. Earlier
reports remain useful evidence but do not carry a `STABLE` result forward when
their audited commit or dependency contract has changed.

| Order | ID | Structural section | Risk | Depends on | Status | Report | Last audited commit |
| ---: | --- | --- | :---: | --- | --- | --- | --- |
| 0 | S00 | Audit foundation, inventory, quality gates, and release policy | A | — | STABLE | `docs/qa/structural-audits/S00-foundation.md` | `b1870c6` |
| 1 | S01 | Shared frontend shell, navigation, providers, errors, skeletons, and i18n | A | S00 | STABLE | `docs/qa/structural-audits/S01-shared-frontend-shell.md` | `afd107f` |
| 2 | S02 | Authentication, session, CSRF, logout, verification, and password recovery | A | S00, S01 | STABLE | `docs/qa/structural-audits/S02-auth-session.md` | `fb098a0` |
| 3 | S03 | Patient core, identity, list/detail, recent views, and categories | A | S00-S02 | NOT STARTED | | — |
| 4 | S04 | Clinical history, treatment entries, odontogram, and attribution | A | S03 | NOT STARTED | | — |
| 5 | S05 | Media upload, image editor, storage, sanitizer, variants, and recovery | A | S03, S04 | NOT STARTED | | — |
| 6 | S06 | Patient finance, ledger, expenses, UZS/USD, export, and PDF | A | S03, S04 | NOT STARTED | | — |
| 7 | S07 | Settings, profile, connected accounts, and account security | A | S02 | NOT STARTED | | — |
| 8 | S08 | Staff, team, permissions, limits, blocking, and access revocation | A | S02, S07 | NOT STARTED | | — |
| 9 | S09 | Admin authentication, console, dentists, staff, plans, and privileged actions | A | S02, S08 | NOT STARTED | | — |
| 10 | S10 | Subscription billing, PayX webhook, plan transitions, and refunds | A | S02, S09 | NOT STARTED | | — |
| 11 | S11 | Appointments, guest/patient card flow, timezone, and overlap rules | B | S03, S08 | NOT STARTED | | — |
| 12 | S12 | Dashboard and analytics aggregation, filters, currency, and charts | B | S03, S06, S11 | NOT STARTED | | — |
| 13 | S13 | Public landing, SEO, public plans, and system/error pages | B | S00, S01 | NOT STARTED | | — |
| 14 | S14 | API contracts, validation, pagination, throttling, and tenant isolation | A | S02-S12 | NOT STARTED | | — |
| 15 | S15 | Database schema, migrations, constraints, indexes, retention, and legacy data | A | S03-S14 | NOT STARTED | | — |
| 16 | S16 | Queue, worker, Redis, scheduled commands, retries, and cleanup | A | S05, S10, S15 | NOT STARTED | | — |
| 17 | S17 | Security, privacy, dependency, CORS/CSP, and observability controls | A | S01-S16 | NOT STARTED | | — |
| 18 | S18 | Performance, bundle, query cost, caching, and resource usage | B | S01-S17 | NOT STARTED | | — |
| 19 | S19 | Responsive, accessibility, localization, and cross-browser closure | B | S01-S18 | NOT STARTED | | — |
| 20 | S20 | CI/CD, Vercel, Railway, backup, rollback, and final production certification | A | S00-S19 | NOT STARTED | | — |

## Program rules

- Work one section at a time unless a finding crosses an explicit dependency.
- Do not mark a downstream section stable while an upstream mandatory contract
  is blocked.
- Stable sections receive no code change unless a verified finding requires it.
- Fixes use focused branches/PRs and regression tests; unrelated cleanup is a
  separately tracked section or PR.
- Update both this tracker and any affected route reports after merge/deploy.
