# Identa

**Identa** is a dental practice-management SaaS for clinics in Uzbekistan — patient records, an
interactive odontogram, appointment scheduling, treatment tracking, billing, and a super-admin
platform console. The interface is fully localized in Russian, Uzbek, and English.

- **Production:** https://identa.uz (web) · https://api.identa.uz (API)

## Monorepo layout

| Path        | Stack                                                              | Role         |
| ----------- | ----------------------------------------------------------------- | ------------ |
| `/` (root)  | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4     | Web frontend |
| `backend/`  | Laravel 12, Sanctum, PostgreSQL (prod) / SQLite (local)           | REST API     |

Key frontend libraries: TanStack Query, Zustand, Radix UI, Recharts, Sentry, Vercel Analytics.

## Features

- Patient management with an interactive 32-tooth odontogram and per-tooth treatment history
- Appointment scheduling (day / week views) with conflict detection
- Payments, invoices, and patient balance tracking
- Analytics dashboards (revenue, top debtors, KPIs)
- Authentication: email/password + Google OAuth, email verification, password reset
- Role-based access control: dentist, assistant (granular permissions), super-admin
- Subscriptions: 30-day trial + paid plans (Basic / Pro) via PayX, with a super-admin billing console
- Cyrillic-safe PDF export (browser print pipeline)

## Local development

Requirements: Node.js 20+, PHP 8.2+, Composer.

```bash
npm install
npm run dev:local      # frontend (127.0.0.1:3000) + backend (127.0.0.1:8001)
npm run db:migrate     # apply backend schema (safe to re-run)
```

The frontend can also run standalone against the built-in mock API (no backend required):

```bash
npm run dev            # frontend only, mock API
```

## Quality gates

```bash
npm run lint           # ESLint
npm test               # vitest (unit / component)
npm run build          # next build
npm run test:backend   # PHPUnit
npm run test:e2e       # Playwright
npm run quality:all    # full local gate (lint + build + unit + backend + migrations + e2e)
```

Security preflight:

```bash
npm run check:secrets
npm run check:runtime-security
npm run quality:security   # dependency audits (frontend + backend)
```

Command matrix: [`docs/qa/COMMAND_MATRIX.md`](docs/qa/COMMAND_MATRIX.md)

## API contract

- OpenAPI spec: [`docs/api/openapi.v1.yaml`](docs/api/openapi.v1.yaml)
- Conventions: [`docs/api/CONVENTIONS.md`](docs/api/CONVENTIONS.md)
- Backend setup: [`backend/README.md`](backend/README.md)

## Deployment & operations

Frontend → Vercel · Backend → Railway (PostgreSQL).

- Pre-deploy runbook: [`docs/release/PRE_DEPLOY_RUNBOOK.md`](docs/release/PRE_DEPLOY_RUNBOOK.md)
- Deployment playbook: [`docs/release/DEPLOYMENT_PLAYBOOK_DRAFT.md`](docs/release/DEPLOYMENT_PLAYBOOK_DRAFT.md)
- Security checklist: [`docs/release/SECURITY_CHECKLIST.md`](docs/release/SECURITY_CHECKLIST.md)
- Secrets management: [`docs/release/SECRETS_MANAGEMENT.md`](docs/release/SECRETS_MANAGEMENT.md)
- Error tracking (Sentry): [`docs/release/ERROR_TRACKING.md`](docs/release/ERROR_TRACKING.md)
- Observability baseline: [`docs/release/OBSERVABILITY_BASELINE.md`](docs/release/OBSERVABILITY_BASELINE.md)
- Backup & rollback: [`docs/release/BACKUP_AND_ROLLBACK.md`](docs/release/BACKUP_AND_ROLLBACK.md)
