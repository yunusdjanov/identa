# Financial Source of Truth

## Active product model

The treatment entry is the single source of truth for patient financial data.
The frontend creates and edits that record through the patient treatment
routes. Each entry owns:

- `treatment_date`
- `treatment_type`
- `cost` / `debt_amount` (work value)
- `paid_amount`
- `currency` (`UZS` or `USD`)

The outstanding balance is derived from the entry's work value minus its paid
amount. Analytics revenue is the sum of treatment-entry `paid_amount`, grouped
by `treatment_date` and currency.

There is no active patient invoice CRUD, separate payment CRUD, quick-payment
endpoint, or legacy odontogram-entry CRUD. The Payments page reads treatment
entries through the patient ledger endpoints and manages clinic expenses
through the expense endpoints.

## Active API boundaries

- `/api/v1/patients/{id}/treatments`
- `/api/v1/patients/{id}/treatments/{treatmentId}`
- `/api/v1/payments/ledger/patients`
- `/api/v1/payments/ledger/history`
- `/api/v1/payments/expenses`
- `/api/v1/analytics/summary`

Subscription billing is separate from patient finance. `/api/v1/billing/*`,
`/api/v1/admin/payments`, and PayX invoice terminology refer only to Identa
plan billing and must not be mixed with patient treatment accounting.

## Retained legacy storage

The `invoices`, `invoice_items`, `payments`, `odontogram_entries`, and
`odontogram_entry_images` tables and tenant-scoped models remain temporarily
for production data safety. They are not read by active patient finance or
clinical UI flows. Patient permanent deletion still removes their rows and
stored media so retained historical objects do not become orphaned.

Do not drop these tables or relationships without a separately reviewed
production migration that includes:

1. a record-count and tenant-integrity report;
2. any required data/media migration;
3. a backup and tested rollback;
4. post-migration orphan checks;
5. an explicit production approval.

## Change rule

New patient finance behavior must extend treatment entries or their derived
ledger/analytics queries. Do not add a second payment record, quick-payment
shortcut, or invoice-based patient balance without an approved product-model
change and migration plan.
