import { NextResponse } from 'next/server';
import { canViewFinancials, requireAuth, list } from '../../../_auth';
import { TREATMENTS } from '../../../_mock-data';

// Mock route mirrors the real TreatmentResource gating: viewers without
// payments.view receive the treatment record with cost/debt/paid/balance
// nulled out. Without this, dev-mode testing of the assistant role would
// see financial values via the network panel even though the UI
// (treatment-history-card + tooth-detail-dialog) now hides them.
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const canSeeFinancials = await canViewFinancials();
    const items = TREATMENTS
        .filter((t) => t.patient_id === id)
        .map((t) => scrubFinancialFieldsIfNeeded(t, canSeeFinancials));
    return list(items);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const body = await request.json();
    const canSeeFinancials = await canViewFinancials();
    // Mirror the real backend TreatmentService::payload — assistant
    // without payments.view cannot SET debt/paid on create; defaults to
    // 0. Server-side scrubbing prevents a tampered client from sneaking
    // in values it shouldn't be able to write.
    const debtAmount = canSeeFinancials ? Number(body.debt_amount ?? body.cost ?? 0) : 0;
    const paidAmount = canSeeFinancials ? Number(body.paid_amount ?? 0) : 0;
    const treatment = {
        id: `trt-${Date.now()}`,
        patient_id: id,
        image_count: 0,
        images: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...body,
        debt_amount: debtAmount,
        paid_amount: paidAmount,
        balance: Math.max(0, debtAmount - paidAmount),
    };
    // Response also scrubbed so the assistant can't read back what they
    // didn't have permission to see (parity with TreatmentResource).
    return NextResponse.json(
        { data: scrubFinancialFieldsIfNeeded(treatment, canSeeFinancials) },
        { status: 201 }
    );
}
