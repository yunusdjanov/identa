import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { canViewFinancials, hasMockPermission, requirePracticePermission } from '../../../../_auth';
import { PATIENTS } from '../../../../_mock-data';
import { resolveMockUser } from '../../../../_mock-users';
import { mockTreatmentStore, normalizeTreatmentPayload, scrubTreatmentFinancials } from '../_contract';

function validationResponse(errors: Record<string, string[]>) {
    return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
}

async function actorSummary() {
    const cookieStore = await cookies();
    const user = resolveMockUser(cookieStore.get('mock_role')?.value, cookieStore.get('mock_user_id')?.value);
    return { id: user.id, name: user.name, role: user.role };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; treatmentId: string }> }) {
    const denied = await requirePracticePermission('patients.view');
    if (denied) return denied;
    const { id, treatmentId } = await params;
    const treatment = mockTreatmentStore.find((item) => item.id === treatmentId && item.patient_id === id);
    if (!treatment) return NextResponse.json({ message: 'Not Found.' }, { status: 404 });
    return NextResponse.json({ data: scrubTreatmentFinancials(treatment, await canViewFinancials()) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; treatmentId: string }> }) {
    const denied = await requirePracticePermission('patients.manage');
    if (denied) return denied;
    const { id, treatmentId } = await params;
    const patient = PATIENTS.find((item) => item.id === id);
    const index = mockTreatmentStore.findIndex((item) => item.id === treatmentId && item.patient_id === id);
    if (!patient || index < 0) return NextResponse.json({ message: 'Not Found.' }, { status: 404 });
    if (patient.is_archived) return validationResponse({ patient: ['Restore the archived patient before editing entries.'] });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { errors, payload } = normalizeTreatmentPayload(body);
    if (Object.keys(errors).length > 0) return validationResponse(errors);
    const canSetFinancials = await hasMockPermission('payments.manage');
    const existing = mockTreatmentStore[index];
    const safePayload = { ...payload };
    if (!canSetFinancials) {
        delete safePayload.cost;
        delete safePayload.debt_amount;
        delete safePayload.paid_amount;
        delete safePayload.currency;
    }
    const debtAmount = Number(safePayload.debt_amount ?? safePayload.cost ?? existing.debt_amount ?? existing.cost ?? 0);
    const paidAmount = Number(safePayload.paid_amount ?? existing.paid_amount ?? 0);
    const updated = {
        ...existing,
        ...safePayload,
        cost: debtAmount,
        debt_amount: debtAmount,
        paid_amount: paidAmount,
        balance: debtAmount - paidAmount,
        updated_at: new Date().toISOString(),
        updated_by: await actorSummary(),
    };
    mockTreatmentStore[index] = updated;
    return NextResponse.json({ data: scrubTreatmentFinancials(updated, await canViewFinancials()) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; treatmentId: string }> }) {
    const denied = await requirePracticePermission('patients.manage');
    if (denied) return denied;
    const { id, treatmentId } = await params;
    const patient = PATIENTS.find((item) => item.id === id);
    const index = mockTreatmentStore.findIndex((item) => item.id === treatmentId && item.patient_id === id);
    if (!patient || index < 0) return NextResponse.json({ message: 'Not Found.' }, { status: 404 });
    if (patient.is_archived) return validationResponse({ patient: ['Restore the archived patient before deleting entries.'] });
    mockTreatmentStore.splice(index, 1);
    return new NextResponse(null, { status: 204 });
}
