# Coupling Hotspots Review (2026-02-28)

> Historical snapshot. This predates the payments ledger, image editor,
> history timeline, recent patients, direct-upload hardening, and appointment
> guest patient-card flow. Re-run the coupling review before using it for a
> current refactoring plan.

## Scope
- Frontend billing and destructive-action flows
- Pages reviewed: `appointments`, `payments`, `patients/[id]`

## Reduced Hotspots

1. Repeated destructive-confirm dialog logic
- Previous state: duplicated confirm/delete modal blocks across multiple pages/components.
- Change: centralized into `components/ui/confirm-action-dialog.tsx`.
- Impact: one behavior/style path for confirm dialogs, lower divergence risk.

2. Duplicated billing shape/mapping logic
- Previous state: invoice summary/table mappings duplicated in `payments` and `patients/[id]`, with separate type definitions.
- Change: centralized in `lib/billing.ts` (`toPaymentInvoiceSummary`, `toInvoiceTableRow`, shared billing types).
- Impact: lower drift risk between list/view/payment-dialog invoice representations.

## Remaining Hotspots (Next P2 Candidates)

1. Large page-level orchestration in `app/patients/[id]/page.tsx`
- Risk: high local state + many dialogs/mutations in one file increase change risk.
- Suggested next step: extract billing dialogs/actions into feature subcomponents.

2. Repeated async mutation patterns (toast + invalidateQueries)
- Risk: subtle inconsistency over time.
- Suggested next step: small shared mutation helpers for common invalidate groups.

3. Page-specific filter/search state patterns
- Risk: duplicated state wiring can diverge.
- Suggested next step: extract lightweight reusable hooks for list filter state.

