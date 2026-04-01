# Secrets Management Baseline

Date: 2026-02-28  
Scope: DentalFlow backend runtime/deployment hardening

## Policy

1. Do not commit runtime credentials to source control.
2. Use environment-level secret injection (host/platform secret manager or CI secret store).
3. Treat placeholder values (`secret`, `password`, `changeme`, etc.) as invalid in production.
4. Fail fast in production boot when critical secrets are missing or weak.
5. For mandatory integrations (e.g., Sentry), enforce DSN presence with `SENTRY_REQUIRED=true`.

## Runtime Enforcement

Implemented components:
- `backend/config/secrets.php`
- `backend/app/Support/ProductionSecretsValidator.php`
- `backend/app/Providers/AppServiceProvider.php` (production fail-fast hook)
- `backend/routes/console.php` (`security:check-secrets`)

Production behavior:
- In `APP_ENV=production`, if `SECRETS_ENFORCE_RUNTIME=true`, app boot fails when:
  - `APP_KEY` is missing/placeholder
  - `DB_PASSWORD` is missing/placeholder for non-sqlite drivers
  - any key listed in `SECRETS_ADDITIONAL_REQUIRED` is missing/placeholder

## Pre-Deploy Validation

Run before migrations and deploy cutover:

```bash
npm run check:secrets
```

or directly:

```bash
cd backend
php artisan security:check-secrets
```

Command exits non-zero on validation failure.

## Required Environment Controls

- `SECRETS_ENFORCE_RUNTIME=true`
- `SECRETS_DISALLOWED_VALUES="null,secret,password,changeme,change-me,example,test,your-secret-here,replace-me"`
- `SECRETS_ADDITIONAL_REQUIRED=` (optional comma-separated integrations, e.g. `SENTRY_LARAVEL_DSN`)
- `SENTRY_REQUIRED=false` (set to `true` in production when Sentry is mandatory)

## Operational Guidance

1. Store secret values in deployment platform secret storage.
2. Rotate DB/app/integration secrets on schedule and after incident response.
3. Keep CI logs redacted; never echo secret values in pipeline output.
4. Include `security:check-secrets` and `security:check-runtime --production` in deployment pre-flight and block release on failure.
