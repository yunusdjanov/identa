# DentalFlow Monorepo

This repository now contains:
- `frontend` app (Next.js) at repo root
- `backend` API (Laravel) in `backend/`

## Phase Status
- Phase 1: frontend professionalization complete
- Phase 2: backend integration in progress

## Local Development

```bash
npm install
powershell -ExecutionPolicy Bypass -File .\scripts\setup-backend.ps1
npm run dev:local
```

Backend schema sync (safe to run any time):
```bash
npm run db:migrate
```

`npm run dev:local` starts frontend on `127.0.0.1:3000` and backend on `127.0.0.1:8001`.
`run-backend.ps1` now resolves the local PHP binary automatically, applies migrations, and serves the API with loopback-safe auth settings.

## Contract-First API
- OpenAPI contract: `docs/api/openapi.v1.yaml`
- API conventions: `docs/api/CONVENTIONS.md`

## Quality Gates
Frontend:
```bash
npm run lint
npm run build
npm test
```

Backend:
```bash
npm run test:backend
```

E2E:
```bash
npm run test:e2e
```

Full local gate:
```bash
npm run quality:all
```

Security preflight:
```bash
npm run check:secrets
npm run check:runtime-security
```

Command matrix reference: `docs/qa/COMMAND_MATRIX.md`

## Release Readiness
- Security checklist: `docs/release/SECURITY_CHECKLIST.md`
- Secrets management baseline: `docs/release/SECRETS_MANAGEMENT.md`
- Error tracking integration: `docs/release/ERROR_TRACKING.md`
- Observability baseline: `docs/release/OBSERVABILITY_BASELINE.md`
- Backup and rollback: `docs/release/BACKUP_AND_ROLLBACK.md`
- Deployment playbook draft: `docs/release/DEPLOYMENT_PLAYBOOK_DRAFT.md`
- Latest go/no-go re-review: `docs/release/GO_NO_GO_REVIEW_2026-02-28.md`
