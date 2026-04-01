# Backup And Rollback Strategy

Date: 2026-02-15  
Target: PostgreSQL + Laravel app (Docker-based local/prod-like runtime)

## Objectives

1. Prevent irreversible data loss.
2. Keep rollback path explicit for both code and database schema.
3. Ensure restore can be tested, not only documented.

## Backup Scope

### Database (required)

- Full PostgreSQL logical backup (`pg_dump`) daily.
- Write-ahead-log/point-in-time strategy is optional for MVP, recommended after first production launch.
- Retention baseline:
  - Daily backups: 14 days
  - Weekly backups: 8 weeks
  - Monthly backups: 6 months

### Application artifacts (recommended)

- Versioned container image tags (never deploy mutable `latest` only).
- Versioned `.env` template and infrastructure config in private repo/secret manager.

## Pre-Deploy Safety Checklist

1. Confirm latest successful database backup exists and is restorable.
2. Run `npm run quality:all` on release candidate commit.
3. Run `php artisan migrate --pretend` (or dry-run equivalent) to review migration impact.
4. Confirm rollback notes exist for every destructive migration.

## Rollback Levels

### Level 1: Code rollback (no schema incompatibility)

1. Deploy previous stable app image/revision.
2. Verify `/api/v1/health` and smoke tests.

### Level 2: Code + schema rollback

Use when current schema breaks previous app behavior.

1. Put app in maintenance mode.
2. Restore latest known-good backup to rollback database target.
3. Deploy matching app revision.
4. Run post-restore validation checks.
5. Re-open traffic.

## Restore Drill Procedure (Must run regularly)

1. Provision isolated restore environment.
2. Restore latest backup.
3. Execute smoke suite:
   - Auth login/logout
   - Patient list/read
   - Appointment create
   - Payment record
4. Record RTO (recovery time objective) and issues.

## Minimum Commands Reference

Logical backup:
```bash
pg_dump -h <host> -U <user> -d <db> -Fc -f backup.dump
```

Restore:
```bash
pg_restore -h <host> -U <user> -d <db> --clean --if-exists backup.dump
```

## Ownership

- PM/Lead: backup policy sign-off.
- Dev/Infra: backup automation and restore drills.
- QA: post-restore smoke verification checklist execution.