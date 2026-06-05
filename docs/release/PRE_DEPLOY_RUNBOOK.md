# Pre-Deploy Runbook

Status: ready for first production cut as of 2026-06-05.

Audience: whoever is doing the production deploy.

Purpose: a single ordered checklist that takes you from "code is green on
main" to "service is live, monitored, and rollback-ready." Every other
release doc in `docs/release/` is reference material for one specific
control; this file is the running order.

## How to use this file

Tick the boxes from top to bottom on the actual deploy day. Do not skip.
If a step is blocked, stop — do not deploy on a partial checklist. Most
of the controls are already implemented in code (see the linked docs);
this runbook is about the human side: secrets, credentials, soak, sign-off.

---

## T-48h — Last code freeze

- [ ] Confirm `main` is on a tagged release commit (`vX.Y.Z`).
- [ ] CI green:
  - [ ] `npm run quality:all` (frontend lint + types + tests + build).
  - [ ] `npm run quality:security` (npm audit + composer audit gate).
  - [ ] Backend `vendor/bin/phpunit` green against PostgreSQL.
- [ ] Run dependency scan locally and confirm clean:
  - Frontend: `npm audit --production` → `found 0 vulnerabilities`.
  - Backend: `composer audit` → `No security vulnerability advisories found.`
- [ ] Open issue list audit — confirm no P0/P1 production issues open.

## T-24h — Staging deploy + soak

This is mandatory. Do not skip even for tiny releases — the FormRequest
+ subscription gating layer has too many interactions to trust without
exercise on a parallel environment.

- [ ] Deploy the release tag to staging (`staging.identa.uz` /
  `api-staging.identa.uz`).
- [ ] Run staging seeder, including at least one trial + one paid +
  one assistant fixture.
- [ ] Run the full smoke matrix (see [Smoke matrix](#smoke-matrix)).
- [ ] Soak: leave staging idle for ≥4h, then re-run /api/v1/health and
  confirm no Sentry errors fired.
- [ ] Browser test — at minimum, complete the
  [Post-deploy verification checklist](#post-deploy-verification-checklist)
  on staging.
- [ ] Sign off in #identa-ops with the staging URL and screenshots of
  /dashboard, /admin/dentists, /billing.

## T-2h — Secrets and prod-env preflight

All secrets must come from the secret manager (not committed). Verify each
one is present, non-empty, and not a placeholder (`change-me`,
`your-key-here`, etc.).

### Backend (`api.identa.uz`)

| Variable | Source | Notes |
| --- | --- | --- |
| `APP_KEY` | `php artisan key:generate --show` once, then secret manager | NEVER reuse staging key |
| `APP_ENV` | constant `production` | |
| `APP_DEBUG` | constant `false` | |
| `APP_URL` | constant `https://api.identa.uz` | |
| `APP_TIMEZONE` | constant `Asia/Tashkent` | enforced by `ProductionSecretsValidator` |
| `FRONTEND_URL` | constant `https://identa.uz` | password reset link base |
| `SANCTUM_STATEFUL_DOMAINS` | constant `identa.uz,www.identa.uz` | |
| `SESSION_DOMAIN` | constant `.identa.uz` | leading dot required for cross-subdomain |
| `SESSION_SECURE_COOKIE` | constant `true` | |
| `DB_*` | managed Postgres credentials | |
| `CACHE_STORE` / `SESSION_DRIVER` / `QUEUE_CONNECTION` | per `.env.example` | |
| `AWS_*` (S3) | object-store creds | bucket must exist + be private |
| `ANTIVIRUS_DRIVER` | `clamav` (recommended) **OR** intentionally null | see ClamAV decision matrix below |
| `CLAMAV_HOST` / `CLAMAV_PORT` | clamd address | only when `ANTIVIRUS_DRIVER=clamav` |
| `MAIL_*` | SMTP creds | password reset depends on this |
| `PAYX_PROJECT_TOKEN` | from PayX dashboard, **production** | NOT the sandbox token |
| `PAYX_WEBHOOK_TOKEN` | from PayX dashboard, **production** | webhook secret, not URL |
| `PAYX_MERCHANT_ID` | from PayX merchant agreement | |
| `GOOGLE_CLIENT_ID` | Google Cloud OAuth client | must match frontend's `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| `SENTRY_LARAVEL_DSN` | Sentry project | enforced by `SENTRY_REQUIRED=true` |
| `SENTRY_REQUIRED` | constant `true` | gate that fails boot if DSN missing |
| `SENTRY_ENVIRONMENT` | constant `production` | |
| `SENTRY_TRACES_SAMPLE_RATE` | start at `0.1` | tune after first week of data |
| `TRUSTED_PROXIES` | edge LB IPs (CF, Railway, etc.) | leave `*` only if single trusted hop |
| `LOG_CHANNEL` | constant `stack` (or `stderr` if shipping logs) | |
| `LOG_LEVEL` | constant `warning` | |

### ClamAV — defer-or-deploy decision

The codebase has the scanner wired up (`AntivirusScannerService`), but the
operational cost (a ClamAV sidecar service consumes ~1 GB RAM + a daily
virus-definition refresh job) is not worth it in every configuration.
Make the call BEFORE the first prod cut, document it here, and revisit
when the situation changes.

**Defer (leave `ANTIVIRUS_DRIVER` unset)** when ALL three hold:
1. The upload surface is restricted to authenticated dentists +
   assistants (no anonymous upload), so the threat is a hijacked session,
   not a drive-by attacker.
2. `ImageCompressionService` magic-byte check is on (it is, by default)
   — non-image bytes are rejected before they touch S3.
3. The deployment is single-tenant or shared-tenant with isolated
   per-dentist S3 prefixes, so a malicious file can't pivot to another
   tenant's data even if it lands in storage.

**Deploy ClamAV** when ANY of these become true:
- You open an anonymous upload endpoint (lead form attachment, support
  ticket attachment, public landing form with file input).
- A regulator / hospital procurement asks for "documented malware
  scanning on PHI uploads" — most do.
- You see anything in `/audit-logs` that looks like exploration of the
  upload endpoint (status 422 storms, malformed MIME types, oversized
  filenames). Sentry will surface these in production via the upload
  controllers.

Current decision: **deferred** as of 2026-06-05. Foundation reasoning:
ishonchli klinika foydalanuvchilari + magic-byte check + per-tenant S3
prefix. Revisit when adding any public upload surface.

After all values are set, run the secrets gate from inside the app
container:

```bash
php artisan secrets:validate
```

It must exit 0. If it fails, stop — the deploy will fail at boot anyway.

### Frontend (`identa.uz`)

| Variable | Source | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | constant `https://api.identa.uz/api` | trailing `/api` required |
| `API_URL` | constant `https://api.identa.uz/api` | SSR proxy |
| `NEXT_PUBLIC_APP_URL` | constant `https://identa.uz` | sitemap + Open Graph |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | same as backend `GOOGLE_CLIENT_ID` | |
| `NEXT_PUBLIC_SENTRY_DSN` | browser DSN from Sentry | separate project recommended |
| `SENTRY_DSN` | Node DSN (SSR + middleware) | usually identical to public |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | constant `production` | |
| `SENTRY_ENVIRONMENT` | constant `production` | |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | start at `0` | bump only when investigating |
| `NEXT_PUBLIC_SENTRY_SEND_PII` | constant `false` | never flip without legal sign-off |
| `NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS` | per hosting plan | |

### Cross-cutting

- [ ] **S3 bucket policy** — required hardening before first prod
  upload. The app writes pre-signed temporary upload URLs into the
  `quarantine/` prefix; if the prepare→finalize handshake breaks
  (patient soft-deleted between the two calls, network error during
  finalize, plan-limit change), the uploaded object is never linked to
  a model row and lives in S3 forever. Apply both:
  1. **Lifecycle rule:** delete objects under `quarantine/` after 24h.
     This is the canonical cleanup path — set it on the bucket before
     the first deploy.
  2. **Block Public Access:** turn on at the bucket level. The app
     never returns the raw S3 URL — every download is signed —
     so misconfigured ACLs are the only way private patient images
     could leak. Defense-in-depth.
- [ ] Backups: confirm latest Postgres snapshot is ≤24h old and a
  restore-to-scratch test succeeded within the last 30 days.
- [ ] DNS: confirm `identa.uz` A/AAAA and `api.identa.uz` records are
  configured and TLS certs are valid for ≥30 more days.
- [ ] PayX dashboard: confirm production webhook URL is set to
  `https://api.identa.uz/api/v1/webhooks/payx` and the secret matches
  `PAYX_WEBHOOK_TOKEN`.
- [ ] Sentry: confirm both projects (backend + frontend) exist, are in
  the production org, and have at least one alert rule wired to a real
  notification channel.

## T-15m — Pre-flight on prod host

- [ ] `git pull` (or image pull) the release tag.
- [ ] Diff `.env` against `backend/.env.example` to catch any missing
  variable added since the last deploy.
- [ ] Confirm `php artisan migrate --pretend` shows only expected
  migrations (no surprise schema drift from a developer branch).
- [ ] Notify users in #identa-ops that the deploy is starting.

## T+0 — Deploy

Steps map directly to `docs/release/DEPLOYMENT_PLAYBOOK_DRAFT.md`. The
extra steps below are checklist-level.

1. [ ] Take application out of rotation OR enable maintenance mode
   (`php artisan down --secret=...`).
2. [ ] Pull new image / restart app container with the new code.
3. [ ] Run database migrations: `php artisan migrate --force`.
   - Watch stdout. Any failure → stop, leave maintenance mode on, fix
     migration before continuing. Do NOT roll forward through a broken
     migration.
4. [ ] Clear and re-warm caches:
   ```bash
   php artisan config:cache
   php artisan route:cache
   php artisan view:cache
   php artisan event:cache
   ```
5. [ ] Restart queue worker(s) so they pick up the new code.
6. [ ] Bring application back up (`php artisan up`).
7. [ ] Deploy frontend (Vercel push / container restart).

## T+5m — Smoke matrix

Run every row before declaring the deploy successful. Time-box: 10 min.

| # | Surface | Action | Pass criteria |
| --- | --- | --- | --- |
| 1 | Public | `GET /` (landing) | 200, HTML loads |
| 2 | API health | `GET https://api.identa.uz/api/v1/health` | 200, response body `{"status":"ok"}` |
| 3 | Auth | Login as dentist (real or smoke account) | redirect to /dashboard, session cookie set, `Secure` + `SameSite=Lax` flags |
| 4 | Patient | Create a throwaway patient | row appears in /patients list |
| 5 | Appointment | Schedule an appointment for tomorrow | shows on dashboard today/week view |
| 6 | Treatment + payment | Add a treatment with debt + record a partial payment | balance math correct, audit log entry exists |
| 7 | Assistant | Create an assistant, login as assistant, hit a denied surface (payments) | 403 / hidden, no panic |
| 8 | Admin | Login at /admin/login | /admin/dentists loads, dentist count > 0 |
| 9 | Billing | Open /billing, confirm plan card + history loads | no 5xx, no console errors |
| 10 | PayX | Trigger a $1 sandbox-like transaction (smoke order) | reaches `paid` state, webhook signature passes |
| 11 | Email | Trigger password reset on a smoke account | email arrives within 60s |
| 12 | Sentry | Throw a controlled `dd()` in a dev-only route OR check that Sentry shows the boot event | event arrives in dashboard within 30s |
| 13 | Audit | Visit /settings → Audit log | last 6 actions visible, scrubbed of financials for view-only roles |
| 14 | Logout | Logout from dentist + assistant + admin | all redirect to login, no zombie cookies |

## T+30m — Post-deploy verification

- [ ] Sentry: zero `error` or `fatal` events in last 30 min that aren't
  already triaged.
- [ ] App logs: error rate within 2× baseline.
- [ ] PayX webhook hit count ≥1 (synthetic transaction from smoke
  matrix).
- [ ] Database connection count stable; no spike in `pg_stat_activity`.
- [ ] Queue depth ≈ 0 after the deploy minute.
- [ ] CDN cache hit rate ≥ baseline on static assets.

## Rollback

Trigger immediately if any of:

- Auth failure rate >2% for >5 min on previously healthy clients.
- Payment mutation failures touching balance integrity (`net_balance`
  drift, refund replay).
- A migration partially applied and failing.
- Sentry shows >50 `fatal` events in 5 min.

Rollback procedure:

1. `php artisan down` (maintenance mode).
2. Roll image / container back to the prior release tag.
3. **Only if the migration is reversible:** `php artisan migrate:rollback`.
   If unsure, leave the schema migrated and rely on backward-compatible
   code from the previous tag — see
   `docs/release/BACKUP_AND_ROLLBACK.md` for guidance on irreversible
   migrations.
4. Clear caches (`config:clear`, `route:clear`, `view:clear`).
5. `php artisan up`.
6. Run rows 1–4 of the smoke matrix; if green, announce rollback in
   #identa-ops with a short post-mortem placeholder.

If the rollback path is more complex than the above (e.g. a migration
that backfilled data), invoke the backup restore procedure from
`docs/release/BACKUP_AND_ROLLBACK.md` instead.

## Recurring controls (weekly while live)

These don't block the first deploy but must be on the calendar.

- [ ] Run `npm audit --production` + `composer audit` every Monday. Any
  HIGH/CRITICAL CVE → patch within 7 days.
- [ ] Rotate `PAYX_WEBHOOK_TOKEN` and `APP_KEY` per the schedule in
  `docs/release/SECRETS_MANAGEMENT.md`.
- [ ] Review Sentry "Issues" view; close or assign anything older than
  14 days.
- [ ] Re-run the dependency upgrade cycle quarterly: `composer outdated
  --direct` + `npx npm-check-updates --target minor`.

## Reference documents

- `docs/release/DEPLOYMENT_PLAYBOOK_DRAFT.md` — full deploy mechanics.
- `docs/release/BACKUP_AND_ROLLBACK.md` — backup cadence + restore drill.
- `docs/release/ERROR_TRACKING.md` — Sentry implementation detail.
- `docs/release/OBSERVABILITY_BASELINE.md` — request correlation + log
  format.
- `docs/release/SECRETS_MANAGEMENT.md` — secret rotation cadence.
- `docs/release/SECURITY_CHECKLIST.md` — pre-prod security gates.
- `backend/.env.example` — backend variable reference.
- `.env.example` — frontend variable reference.
