# Error Tracking Integration (Sentry)

Date: 2026-02-28  
Scope: Backend exception pipeline + context + payload scrubbing

## Implementation

- Composer package: `sentry/sentry-laravel`
- Laravel exception hook: `backend/bootstrap/app.php`
  - `Sentry\Laravel\Integration::handles($exceptions)`
- Sentry config: `backend/config/sentry.php`
- Event sanitizer: `backend/app/Support/SentryEventSanitizer.php`
  - attaches `request_id` tag
  - attaches authenticated `user.id` and `role` (when available)
  - redacts sensitive fields in request payload, extras, and contexts
- Request scope enrichment: `backend/app/Http/Middleware/AttachRequestContext.php`
  - sets Sentry scope tag/context per request

## Environment Variables

- `SENTRY_LARAVEL_DSN`
- `SENTRY_RELEASE`
- `SENTRY_ENVIRONMENT`
- `SENTRY_SEND_DEFAULT_PII=false` (recommended default)
- `SENTRY_SAMPLE_RATE`
- `SENTRY_TRACES_SAMPLE_RATE`
- `SENTRY_PROFILES_SAMPLE_RATE`
- `SENTRY_REQUIRED=true` (production gate, enforced by secrets validator)

## Deployment Preflight

1. Set `SENTRY_REQUIRED=true` in production environment.
2. Ensure `SENTRY_LARAVEL_DSN` is injected by secret manager.
3. Run:

```bash
npm run check:secrets
```

This fails when Sentry is required but DSN is missing/placeholder.

## Test Coverage

- `backend/tests/Unit/SentryEventSanitizerTest.php`
- `backend/tests/Unit/ProductionSecretsValidatorTest.php` (Sentry-required gate)
