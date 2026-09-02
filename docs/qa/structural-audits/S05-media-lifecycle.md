# Structural audit: media lifecycle

- Date: 2026-09-02
- Auditor: Codex
- Base/final commit: `066cb77` / `3cf5aec`
- Runtime PR: `#31` (`fix: harden media upload lifecycle`)
- Environment: local source review, Vitest/JSDOM, optimized Next build, GitHub Actions PHP 8.4/Laravel/SQLite and Chromium, Vercel, Railway CLI, private Cloudflare R2 configuration checks, and production read-only HTTP/runtime logs
- Risk tier: A
- Dependencies: S00, S01, S02, S03, S04
- Data classification: patient profile photos, clinical gallery photos, treatment images, quarantine/approved object paths, MIME type, stored byte size, generated variants, tenant ownership, and media-processing status
- Production restrictions: no synthetic patient lookup, upload, edit, delete, object mutation, audit-generated database write, queue-failure injection, or credential output; only approved deployment changes, guest-safe HTTP, redacted status/log inspection, and observation of naturally queued jobs

## Result

Status: STABLE

All verified S05 code and runtime findings are fixed. Runtime PR `#31`, both
pull-request CI runs, Vercel, the Railway API/worker/cron deployments, public
health checks, and the restored media worker passed for merge commit
`3cf5aec`. The restored worker consumed a real pre-existing
`ProcessUploadedMedia` job successfully, and the operator confirmed that no media remained
in the processing state. No production test media was created or deleted.

## Inventory

- Profile, oral/clinical, and treatment-image multipart/direct-upload entry
  points, including single and batch finalize behavior
- Browser validation and preprocessing for JPEG, PNG, and WebP uploads
- Private R2 quarantine and approved paths, protected/signed reads, stored disk
  attribution, object verification, sanitizer, and variant definitions
- `ProcessUploadedMedia`, variant generation/deletion jobs, Redis queues,
  pending-media recovery, and variant-recovery commands
- Production runtime policy, environment contract, queue command, deployment
  runbook, upload-security checklist, and core guardrails
- Media-related patient routes and UI states only; full route-level responsive
  and accessibility certification remains with the page tracker and S19

## Layer coverage

| Layer | Status | Evidence/notes |
| --- | --- | --- |
| Product contract | PASS | JPEG/PNG/WebP are the single supported upload contract across frontend, API finalize, sanitizer, private storage, approved reads, variants, and recovery. |
| UX and states | PASS | Declared unsupported MIME types are rejected consistently; pending objects remain hidden until approval and recover without requiring the user to upload again. |
| Frontend architecture | PASS | A shared validator replaced divergent profile, clinical, treatment, and browser-optimization checks without adding a dependency or global state. |
| API contract | PASS | Direct finalize verifies the real stored object's size and bounded magic-byte type before creating/advancing media records; profile, clinical, treatment single, and treatment batch flows share the control. |
| Authorization and privacy | PASS | Existing tenant and permission gates remain server-side; production requires a private S3-compatible media disk, and pending/quarantine objects are never treated as approved display media. |
| Data integrity | PASS | Row locks plus expected quarantine-path comparison prevent stale scan jobs from approving, rejecting, or deleting a newer upload; stale objects are cleaned without overwriting current state. |
| Performance | PASS | Header verification streams only bounded bytes; recovery is age-, interval-, and batch-bounded; database iteration is chunked; variants use shared definitions. |
| Operations | PASS | Redis worker queues `media,cleanup,default`; pending recovery covers broker outages; approved-only variant recovery covers profile, clinical, and treatment media; production boot fails closed for unsafe media settings. |
| Accessibility/responsive/i18n | PASS | No layout or copy contract was expanded; shared validation preserves localized errors and existing accessible controls. Required Chromium CI passed. |
| Verification | PASS | Focused regressions, lint/typecheck/build/OpenAPI/guardrails, complete GitHub CI, deployment provenance, guest-safe smoke, worker error check, and a completed production media job support the result. |

## Findings

| ID | Severity | Finding | Evidence | Fix/test | Status |
| --- | --- | --- | --- | --- | --- |
| S05-001 | P1 | Direct-upload finalize could trust client-declared size/type instead of the stored object, allowing an oversized or non-image object to enter processing. | Profile, clinical, treatment single, and treatment batch finalize paths were traced to client metadata. | Add `DirectUploadObjectVerifier` for actual size and bounded JPEG/PNG/WebP magic-byte verification; cover all finalize paths and cleanup on rejection. | FIXED |
| S05-002 | P1 | A delayed scanner job could mutate a media row after a newer upload replaced its quarantine object. | The scan job did not atomically prove that the row still referenced the job's original object at approval/rejection time. | Lock the row and compare expected quarantine paths before state transitions; stale clean/infected job regressions verify the newer upload wins. | FIXED |
| S05-003 | P2 | Variant recovery omitted clinical-gallery media and could queue pending quarantine objects as variant sources. | `media:queue-variants` covered profile/treatment paths without an approved-state boundary or clinical model. | Use shared variant definitions, include active clinical photos, require `approved`, chunk queries, and test all active types plus pending exclusions. | FIXED |
| S05-004 | P2 | Frontend checks accepted broad `image/*` values or trusted a supported extension even when the browser declared SVG/GIF/other content. | Upload surfaces contained several divergent MIME/extension conditions. | Centralize JPEG/PNG/WebP validation; use extension fallback only when MIME is empty; add renamed-file regression tests. | FIXED |
| S05-005 | P1 | Production could boot with a local/public/non-S3 media disk or with real-object finalize verification disabled. | Runtime policy validated other security settings but not the media disk driver and finalize verification control. | Fail production boot unless `MEDIA_DISK` resolves to an S3-compatible disk and finalize verification is true; add unit coverage and core guardrails. | FIXED |
| S05-006 | P2 | Example environment and operations guidance diverged from the deployed R2 and Redis worker contract. | The examples still described generic AWS variables, database queue defaults, and incomplete worker queues. | Document canonical R2 variables, private quarantine lifecycle, Redis queues, bounded recovery, worker command, and deploy checks. | FIXED |
| S05-007 | P1 | Railway API and cron deployments initially failed after the fail-closed policy because required explicit media variables were absent/inconsistent; the worker also required its queue manifest during source deployment. | Production logs reported the private-media policy failure; service metadata exposed the missing worker start command in an intermediate deployment. | Set the two non-secret media controls on all PHP services, redeploy API and both crons from `main`, deploy the worker from the identical backend tree with its queue manifest, and verify all final statuses plus job completion. | FIXED |

## Commands and environments

```text
npm run lint
npm exec tsc -- --noEmit
npm test -- --run <S05 focused files>       # 38/38
npm test                                    # 510/511 locally; unchanged appointment timing case only
npm run check:core-guardrails
npm run check:openapi                       # 68 paths
npm run build
git diff --check
```

No supported local PHP 8.4 binary was available. GitHub Actions supplied the
authoritative fresh-migration and complete Laravel suite. PR head
`7cc8262a` produced successful `CI Quality and Security` runs `491`
(`33487894623`) and `492` (`33489029698`), including Frontend Quality,
Backend Tests, Dependency Security Audit, and Browser Journeys and
Accessibility. The merge commit is `3cf5aec`; its backend tree
`fb59c1174dab1be89006d4de80eb0b2233580708` is identical to the worker upload.

## Production smoke

Post-merge/deployment evidence for `3cf5aec`:

- `https://api.identa.uz/api/v1/health` -> 200 with `status: ok`
- `https://identa.uz/` -> 200 with Vercel cache plus CSP, HSTS,
  content-type, frame, referrer, and permissions-policy controls
- unauthenticated protected media/profile/treatment requests -> 401 without
  patient/media disclosure; protected patient route -> login redirect
- Vercel deployment status -> success
- Railway `identa` deployment `b5ff457e-b71b-4fb9-9c30-b4976d212880` -> success
  at commit `3cf5aec`
- Railway subscription cron deployment
  `066cf005-ca91-410b-bfcc-9d64c924faa6` -> success at commit `3cf5aec`
- Railway account-cleanup cron deployment
  `04acb7f6-1c85-4300-8fe0-80504ad9b54a` -> success at commit `3cf5aec`
- Railway worker deployment `95e18e6a-f6d8-4937-9334-56683084d9d1` -> success
  with the identical backend tree and explicit Redis queue command
- worker runtime errors -> none in the checked window; a pre-existing
  `ProcessUploadedMedia` job completed successfully in 923.67 ms
- operator visual verification -> no media remained in the processing state

## Blocked, accepted, or not tested

- No authenticated production patient/media read or synthetic upload/edit/
  delete was performed. Real object bytes, paths, patient identifiers, and
  credentials were not read or recorded for audit evidence.
- Production failure injection, corrupt-object upload, stale-job races, and
  cross-tenant access were verified in tests/CI rather than against real data.
- The pre-deploy migration command ran normally, but the runtime change contains
  no schema migration or data rewrite.
- Manual Firefox/WebKit, zoom, screen-reader speech, and exhaustive route-level
  responsive checks remain S19/page-audit evidence.

## Reopen triggers

- Changes to profile, clinical, or treatment upload/finalize/edit/delete/read
  flows; supported formats; sanitizer; variants; polling; or cache keys
- Changes to storage disks, R2/S3 variables, signed/protected media responses,
  quarantine lifecycle, object paths, or direct-upload verification
- Changes to media models/status fields, scanner transitions, queue names,
  worker command, retries/timeouts, pending recovery, cleanup, or cron behavior
- Changes in S02 auth, S03 patient ownership, S04 treatment lifecycle, S08
  permissions, S14 API boundaries, S15 schema, S16 queues, S17 security, S18
  performance, S19 client coverage, or S20 deployment policy
- Missing approved objects, pending media older than the alert threshold,
  failed media/cleanup jobs, queue backlog, cross-tenant media access, unsafe
  production disk, failed deployment, or a relevant dependency advisory

## Final verification

Media upload now has one JPEG/PNG/WebP contract from browser selection through
stored-object verification, private quarantine, sanitizer, atomic approval,
protected reads, variant generation, deletion, and recovery. Stale jobs cannot
overwrite newer uploads; missing variants and pending queue interruptions have
bounded recovery; unsafe production media configuration fails closed. CI,
Vercel, Railway API/worker/cron parity, public smoke, real queue processing, and
operator verification passed for `3cf5aec`. S05 is closed as STABLE.
