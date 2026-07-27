import { NextResponse } from 'next/server';
import { canViewFinancials, hasMockPermission, requireAuth, ok } from '../../../../_auth';
import { TREATMENTS } from '../../../../_mock-data';

// Scrub financial fields from the treatment record when the viewer lacks
// payments.view. Mirrors the real TreatmentResource so dev-mode testing
// reflects the production payload shape.
function scrubFinancialFieldsIfNeeded<T extends Record<string, unknown>>(
    treatment: T,
    canSeeFinancials: boolean
): T {
    if (canSeeFinancials) return treatment;
    return {
        ...treatment,
        cost: null,
        debt_amount: null,
        paid_amount: null,
        balance: null,
    };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; treatmentId: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id, treatmentId } = await params;
    const canSeeFinancials = await canViewFinancials();
    const treatment = TREATMENTS.find((t) => t.id === treatmentId && t.patient_id === id) ?? TREATMENTS[0];
    return ok(scrubFinancialFieldsIfNeeded(treatment, canSeeFinancials));
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; treatmentId: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id, treatmentId } = await params;
    const body = await request.json();
    const canSeeFinancials = await canViewFinancials();
    const canSetFinancials = await hasMockPermission('payments.manage');
    const existing = TREATMENTS.find((t) => t.id === treatmentId && t.patient_id === id) ?? TREATMENTS[0];
    // Defense-in-depth: when caller lacks payments.manage, refuse to apply
    // debt/paid keys from the request body. Mirrors TreatmentService::
    // payload's permission gate — closes the silent data-loss bug where
    // a clinical assistant editing a treatment without seeing the price
    // would POST debt=0/paid=0 (from empty hidden form inputs) and wipe
    // the dentist owner's real values.
    const { debt_amount: _ignoreDebt, paid_amount: _ignorePaid, cost: _ignoreCost, balance: _ignoreBalance, ...safeBody } = body;
    const merged: Record<string, unknown> = canSetFinancials
        ? { ...existing, ...body }
        : { ...existing, ...safeBody };
    return ok(scrubFinancialFieldsIfNeeded(merged, canSeeFinancials));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; treatmentId: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    await params;
    return NextResponse.json({ message: 'Deleted.' });
}
