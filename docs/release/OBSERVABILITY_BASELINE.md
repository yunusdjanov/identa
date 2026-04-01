# Observability Baseline

Date: 2026-02-15  
Scope: Phase 2 local-ready baseline (frontend + backend)

## Baseline Objectives

1. Every API request is traceable end-to-end.
2. Failures are diagnosable from logs with enough context.
3. There is a clean hook to attach external error tracking before production.

## Implemented Controls

### Request correlation IDs

- Middleware: `backend/app/Http/Middleware/AttachRequestContext.php`
- Behavior:
  - Reads inbound `X-Request-Id` when provided.
  - Generates UUID when absent.
  - Adds request context to logs: request id, method, path, ip, user id.
  - Propagates `X-Request-Id` in API responses.
- Tests:
  - `backend/tests/Feature/RequestContextMiddlewareTest.php`

### Health signal

- Endpoint: `GET /api/v1/health`
- Used for runtime and deployment smoke checks.

### Audit stream for critical business/security events

- Auth, admin lifecycle, patient, and payment critical actions are persisted in audit logs.
- This complements request logs by preserving domain-level intent and actor identity.

## Structured Logging Standard

Local baseline:
- Human-readable Laravel logs are acceptable for day-to-day local debugging.

Production target:
- JSON logs to stdout/stderr with these required fields:
  - `timestamp`
  - `level`
  - `message`
  - `request_id`
  - `path`
  - `method`
  - `user_id` (nullable)
  - `exception.class` (when present)

## Error Tracking Hook (Pre-Production Requirement)

Implemented integration:
- Provider: Sentry (`sentry/sentry-laravel`)
- Exception pipeline: `bootstrap/app.php` -> `Integration::handles($exceptions)`
- Context propagation:
  - request id tag
  - authenticated user id/role when available
- Payload controls:
  - sensitive request/extra/context keys are redacted before send
  - default PII collection remains disabled (`SENTRY_SEND_DEFAULT_PII=false`)

## Operational Playbook (Local)

1. Reproduce issue and capture failing request timestamp.
2. Pull request id from API response header (`X-Request-Id`).
3. Trace same request id in backend logs.
4. Correlate with audit log entries for actor + action timeline.
5. Apply fix and re-run full local quality gates (`npm run quality:all`).

## Open Items Before Production

- Configure production alert routing/escalation policy in Sentry project settings.
- Define error severity taxonomy and paging thresholds.
- Add dashboard panels for API error rate and auth failure rate.
