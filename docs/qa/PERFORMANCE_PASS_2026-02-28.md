# Performance Pass (P2) - 2026-02-28

## Scope
- Frontend-only non-deployment track.
- Focused on the heaviest UI paths with repeated transforms/render pressure:
  - `app/appointments/page.tsx`
  - `app/patients/[id]/page.tsx`

## Findings and Fixes Applied

### 1) Appointments view repeated filtering/grouping in render
- Risk:
  - Day and week layouts previously repeated array filtering/sorting work in render paths.
  - Drag-and-drop occupancy checks were repeatedly scanning arrays.
- Implemented:
  - Precomputed memoized maps by `id`, `date`, and `date+time`.
  - Week date descriptors memoized once per anchor date.
  - Day/week rendering now reads grouped maps instead of recomputing filters.
- Result:
  - Reduced per-render computation and smoother drag/drop behavior under higher appointment counts.

### 2) Patient detail invoice list sorted client-side on every query refresh
- Risk:
  - Recent invoices were cloned and sorted in the client for each query update.
  - Sorting work belongs on the API side and creates unnecessary client CPU work.
- Implemented:
  - Moved invoice ordering to API query: `sort: '-invoice_date,-created_at'`.
  - Removed local invoice sort step in `app/patients/[id]/page.tsx`.
- Result:
  - Less render-time CPU in patient detail billing block.
  - Single source of ordering truth at API layer.

### 3) Patient detail billing mutations invalidated broad query prefixes
- Risk:
  - Invoice/payment mutations invalidated global `['invoices']` / `['payments']` prefixes, potentially triggering unnecessary refetches.
- Implemented:
  - Narrowed invalidation to patient-detail-specific billing keys:
    - `['invoices', 'recent', 'patient-detail', id]`
    - `['payments', 'summary', 'patient-detail', id]`
    - `['payments', 'invoice', 'patient-detail', id, *]`
  - Kept `['dashboard']` invalidation for summary coherence.
- Result:
  - Reduced avoidable refetch churn while preserving data consistency.

### 4) Frequent background refetches on patient detail summary queries
- Risk:
  - Default stale behavior can cause repetitive network chatter during active editing sessions.
- Implemented:
  - Added short `staleTime` (`30s`) for patient detail summary queries and invoice-payment-history query.
- Result:
  - Lower redundant fetch pressure without materially reducing UX freshness.

### 5) Invoice payment-history modal fetched a large fixed page
- Risk:
  - Invoice view requested up to `100` payment rows on modal open even when user only needs recent rows.
  - Slower modal open on invoices with large payment history.
- Implemented:
  - Switched patient-detail invoice payment-history query to incremental pagination (`20` per page).
  - Added "Load more payments" action in invoice modal.
- Result:
  - Faster initial modal content load and lower initial payload size on large histories.

## Validation
- `npm run quality:frontend` passed after changes:
  - `npm run lint`
  - `npm run build`
  - `npm test` (24/24 passing)

## Seeded Dataset Check
- Seed command:
  - `npm run perf:seed`
- Snapshot command:
  - `npm run perf:snapshot`

Latest run (2026-02-28):
- Dataset after seeding (demo dentist):
  - `patients`: 300
  - `appointments`: 1211
  - `invoices`: 253
  - `payments`: 498
- Representative query timings (`perf:snapshot`):
  - `appointments.day_view_slots`: 3 ms (25 rows)
  - `appointments.week_view_range`: 1 ms (120 rows)
  - `patient_detail.upcoming_appointments_top3`: 2 ms
  - `patient_detail.recent_invoices_top3`: 0 ms (3 rows)
  - `patient_detail.invoice_payments_page1_20`: 0 ms
  - aggregate: `max 3 ms`, `avg 1 ms`

Interpretation:
- With a substantially larger local dataset, the current query patterns for the heaviest views remain responsive.
- Remaining performance work is optimization reserve, not a blocker for the next local development phase.

## Remaining P2 Performance Backlog
- Add paginated payment-history loading in invoice view modal instead of fixed high cap.
- Split patient-detail billing modal logic into smaller memoized subcomponents to reduce parent re-render surface.
- Run explicit seeded-data profiling pass and capture measurable render/fetch timings (React Profiler + network waterfall) for closure evidence.
