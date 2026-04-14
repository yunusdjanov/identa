# Security Checklist

Date: 2026-02-15  
Scope: DentalFlow frontend + Laravel backend (Phase 2 local-ready baseline)

## Checklist Status

| Area | Status | Notes |
| --- | --- | --- |
| Session auth with httpOnly cookies | Done | Sanctum session flow in place (`auth:sanctum`) |
| CSRF protection | Done | `/api/v1/auth/csrf-token` + `X-CSRF-TOKEN` flow active |
| Role enforcement | Done | `EnsureRole` middleware (`admin`, `dentist`) |
| Tenant isolation | Done | Resource queries are dentist-scoped and tested |
| Password hashing and reset | Done | Laravel hashing + reset endpoints implemented |
| Auth endpoint throttling | Done | Login/forgot/reset throttles configured; self-registration disabled |
| Request correlation ID | Done | `X-Request-Id` middleware + response propagation |
| Audit logging for critical actions | Done | Auth/admin/patient/payment events tracked |
| HTTPS-only cookie policy | Done (implementation) | Runtime production policy check validates `APP_URL=https` + `SESSION_SECURE_COOKIE=true`; remaining work is production env rollout |
| Secrets and env management policy | In progress | Runtime production validator + preflight command added; managed secret-store rollout still required per environment |
| Dependency vulnerability scan in CI | Done (implementation) | Local gate is green via `npm run quality:security`; CI workflow `.github/workflows/ci-quality-security.yml` runs the same gate on push/PR |
| Security headers baseline | Done (implementation) | App-level middleware + runtime policy check in place; remaining work is production edge/proxy env rollout (`TRUSTED_PROXIES`, HSTS enablement) |
| Provider-backed error tracking | Done (implementation) | Sentry integrated in exception pipeline with request/user context and payload scrubbing (`docs/release/ERROR_TRACKING.md`) |

## Required Before Production

1. Enable TLS end-to-end and set:
   - `SESSION_SECURE_COOKIE=true`
   - production `SANCTUM_STATEFUL_DOMAINS`
2. Move all credentials/keys to secure secret storage (no plaintext in CI/deploy configs).
   - Enforce with `npm run check:secrets` in deployment pre-flight.
3. Add automated dependency and image vulnerability checks.
4. Apply edge/proxy security policy and enable HSTS in TLS environments (`SECURITY_HSTS_ENABLED=true`).
5. Complete a manual abuse-case pass on auth and admin endpoints.
