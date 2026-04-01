# Deployment Playbook (Draft)

Date: 2026-02-15  
Target selected: Linux host with Docker Compose (single-tenant MVP deployment)

## Why This Target

- Fastest path from local Docker workflow to first live environment.
- Minimal ops overhead for solo-dentist MVP stage.
- Easy migration path later to managed container/Kubernetes if needed.

## Environment Topology

- Reverse proxy (Nginx/Caddy)
- `app` (Laravel API)
- `postgres`
- `redis`
- Optional: `mailpit` only for non-production

## Release Branching Strategy

1. Merge approved work into protected main branch.
2. Tag release commit (`vX.Y.Z`).
3. Deploy using immutable image tag derived from commit SHA.

## Deployment Steps

1. Pre-flight
   - Confirm latest backups are healthy.
   - Confirm secrets are present in target environment.
   - Run `npm run release:preflight:production` and require pass before deploy.
   - Confirm `npm run quality:all` passed for release commit.
2. Deploy
   - Pull image(s) for release tag.
   - Run database migrations.
   - Restart services with zero/minimal downtime strategy.
3. Verify
   - `GET /api/v1/health` returns 200.
   - Execute critical smoke checks (auth + patient + appointment + payment + admin).
   - Verify logs show healthy startup and no migration errors.

## Environment Variables (Production Baseline)

Required hardening values:
- `APP_ENV=production`
- `APP_DEBUG=false`
- `SESSION_SECURE_COOKIE=true`
- `SESSION_SAME_SITE=lax` (or `strict` if frontend topology allows)
- `SANCTUM_STATEFUL_DOMAINS=<production frontend domain>`
- `LOG_CHANNEL=stderr` (recommended when shipping logs externally)
- `SENTRY_REQUIRED=true`
- `SENTRY_LARAVEL_DSN=<provider DSN from secret manager>`

## Post-Deploy Verification Checklist

1. Dentist login/logout flow.
2. Patient create/read flow.
3. Appointment create flow.
4. Payment record flow.
5. Admin dentist status update flow.
6. Check audit entries for above actions.

## Rollback Trigger Criteria

Rollback immediately if any occurs:
- Auth failure spike or persistent 401/419 on healthy clients.
- Payment mutation failures affecting balance integrity.
- Migration failure causing API 5xx on critical paths.

## Open Decisions

- Hosting provider final choice (single VM vs managed platform).
- TLS termination ownership (proxy vs platform LB).
- Error tracking provider (Sentry recommended).
