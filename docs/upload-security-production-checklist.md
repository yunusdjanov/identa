# Upload Security Production Checklist

This checklist closes the medical upload hardening phase and should be run before enabling production uploads.

## Required Runtime

- Run database migrations before release:
  - `php artisan migrate --force`
- Run a queue worker for media processing:
  - `php artisan queue:work --queue=default --tries=3 --timeout=180`
- Keep the media disk private. Do not expose bucket/object URLs publicly.
- Use signed URLs through the Laravel API for patient photos and treatment-entry images.

## Environment

Set these values in production:

```dotenv
QUEUE_CONNECTION=database
MEDIA_DISK=r2
MEDIA_VERIFY_DIRECT_UPLOADS_ON_FINALIZE=true
MEDIA_CHECK_REMOTE_VARIANT_EXISTS=false
MEDIA_MAX_UPLOAD_MB=20

# Current production policy: defer ClamAV while uploads stay authenticated,
# image-only, magic-byte checked, and tenant-isolated. Set ANTIVIRUS_DRIVER
# to clamav before any public upload surface or regulatory requirement.
ANTIVIRUS_DRIVER=null
# ANTIVIRUS_DRIVER=clamav
# CLAMAV_HOST=127.0.0.1
# CLAMAV_PORT=3310
# CLAMAV_TIMEOUT=10
```

For R2/S3, also set the existing storage keys used by `config/filesystems.php`.

## Manual QA

1. Upload a clean patient photo.
   - Record starts as `pending`.
   - File is written under `quarantine/`.
   - Queue approves it, stores the sanitized copy under `approved/`, and the image becomes visible.
2. Upload a clean treatment-entry image.
   - UI shows processing while scan/compression runs.
   - Thumbnail loads in list/edit views.
   - Full preview loads only after opening the gallery.
3. Upload an EICAR test file or infected sample in a safe test environment.
   - Upload is rejected.
   - Quarantine object is deleted.
   - Record is marked `rejected`.
   - No image URL is returned.
4. Try direct image access while unauthenticated.
   - Request is rejected.
5. Try accessing another dentist's media while authenticated.
   - Request is rejected.
6. Try oversized uploads for the current plan.
   - Backend returns the plan limit error.
   - Also verify the absolute `MEDIA_MAX_UPLOAD_MB` ceiling on multipart and direct-upload finalize paths.
7. Try upload/delete/write actions in read-only subscription mode.
   - Backend returns `subscription_read_only`.

## Notes

- Local development uses `ANTIVIRUS_DRIVER=null` unless explicitly changed.
- Production ClamAV is an explicit risk decision. The canonical decision
  matrix lives in `docs/release/PRE_DEPLOY_RUNBOOK.md`.
- Existing media rows default to `approved` during migration so old patient data stays visible.
- If the queue is down, new uploads remain hidden as `pending` rather than serving unscanned files.
- Alert when pending media age grows unexpectedly. A useful first threshold is any `pending` row older than 10 minutes.
- Reconcile approved database paths against private storage regularly and alert on missing approved objects or unreferenced approved objects before deleting anything.
