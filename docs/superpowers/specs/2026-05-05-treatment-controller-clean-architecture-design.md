# Treatment Controller Clean Architecture Design

## Goal

Refactor the large treatment controller into smaller, testable backend units without changing any public API response shape, routes, validation behavior, permission behavior, subscription enforcement, image security, or tenant isolation.

The first scope is only `PatientTreatmentController`. Other large controllers can follow the same pattern later, but they are intentionally out of scope for this pass.

## Current Fit

The project already has FormRequest validation, middleware-based route permissions, service classes, jobs for media processing, and feature tests covering treatment CRUD, image upload, direct upload, media security, plan limits, and tenant isolation.

The controller currently mixes:

- tenant-owned patient and treatment lookup;
- list/filter/sort/pagination and summary queries;
- treatment create/update/delete business rules;
- image upload, finalization, streaming, cleanup, variant URL generation;
- direct upload ticketing and completion;
- API response transformation.

This makes changes risky because storage, security, response formatting, and business logic are coupled in one file.

## Architecture

Use services and resources, not repositories.

`TreatmentService`

- Resolve tenant dentist and subscription owner from the authenticated actor.
- Find owned patients and treatments.
- Build list and all-treatment queries.
- Create, update, and delete treatments.
- Normalize treatment payload fields such as `teeth`, `tooth_number`, `debt_amount`, `paid_amount`, and balance.
- Keep audit logging for create/update/delete behavior.

`TreatmentImageService`

- Upload treatment images.
- Enforce plan image limits and upload/stored size limits.
- Store sanitized/optimized images in quarantine/approved flow as already implemented.
- Create and delete `TreatmentImage` rows.
- Build image URLs and stream image variants.
- Queue image variants and cleanup jobs.
- Preserve scan lifecycle behavior.

`TreatmentImageDirectUploadService`

- Move from `App\Support` to `App\Services` if practical in this pass.
- Continue to own direct-upload prepare/finalize behavior.
- Preserve cache ticket structure and response format.
- Avoid generalizing it for odontogram or patient photos in this pass.

`TreatmentResource`

- Return exactly the same treatment JSON fields currently produced by the controller.
- Support `includeImages` and `includePatient` flags.

`TreatmentImageResource`

- Return exactly the same image JSON fields currently produced by the controller.
- Keep pending media URLs as `null`.
- Keep `thumbnail_url`, `preview_url`, readiness flags, scan fields, and timestamps unchanged.

## Controller Shape

`PatientTreatmentController` should become a thin coordinator:

- receive already-validated request;
- call service methods;
- return JSON or stream response;
- preserve status codes and existing route signatures.

The controller may keep small request-only helpers such as reading `include=images` or `include=summary` if moving them would make the service less clear.

## Response Compatibility

No frontend-breaking response changes are allowed.

Required compatibility points:

- List responses keep `data` and `meta.pagination`.
- All-treatment response keeps existing optional `meta.summary`.
- Treatment objects keep current keys and numeric casting.
- `data.images` remains the same array shape.
- Direct upload responses keep `supported`, `upload`, `uploads`, `upload_id`, `url`, `headers`, `expires_at`, `failed`, and `data` structure as currently tested.
- Streaming endpoints keep current content type, cache headers, and fallback variant generation behavior.

## Authorization And Security

Route middleware remains the first line for role, permission, and subscription access.

Services must still enforce:

- tenant-owned patient/treatment/image lookup;
- plan image count and size limits;
- read-only write blocking via existing middleware;
- pending or rejected media cannot be downloaded;
- direct upload tickets cannot be reused across tenant/patient/treatment boundaries;
- storage cleanup remains best effort but never exposes orphaned uploads.

Policies added in the tenant-isolation work remain available, but this pass does not require converting every controller lookup to `$this->authorize()` if the existing explicit tenant filters are safer and already covered by tests.

## Testing Strategy

Baseline and regression tests:

- `OdontogramTreatmentApiTest`
- `MediaUploadSecurityTest`
- `StrictTenantIsolationTest`
- `TenantIsolationPolicyTest`

Final verification:

- Laravel Pint on touched PHP files.
- Full `php artisan test`.

No new API behavior is intended, so new tests should be added only for extracted service behavior that is not already covered by feature tests or where extraction could introduce a regression.

## Out Of Scope

- Refactoring `PatientController`, `PatientOdontogramController`, or `InvoiceController`.
- Changing routes.
- Changing frontend API clients.
- Changing database schema.
- Introducing a repository layer.
- Generalizing all media upload flows into one abstraction.
- Changing image security, ClamAV, signed URL, or quarantine behavior.

## Risks

The riskiest parts are image streaming, variant path generation, pending scan behavior, and direct upload finalization. These must be moved with very small steps and verified after each extraction.

Resource introduction is also risky if it changes exact JSON casting. The first resource implementation should be a direct port of the current transform methods.
