import { NextResponse } from 'next/server';
import { ok, requirePermission } from '../../_auth';
import { PATIENTS } from '../../_mock-data';
import { normalizePatientPayload } from '../_contract';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission('patients.view');
    if (denied) return denied;
    const { id } = await params;
    const patient = PATIENTS.find((p) => p.id === id);
    if (!patient) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    return ok(patient);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission('patients.manage');
    if (denied) return denied;
    const { id } = await params;
    const body = await request.json();
    const existing = PATIENTS.find((p) => p.id === id);
    if (!existing) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    if (existing.is_archived) {
        return NextResponse.json({
            message: 'The given data was invalid.',
            errors: { patient: ['Restore the archived patient before editing.'] },
        }, { status: 422 });
    }
    const { errors, payload } = normalizePatientPayload(body, { preserveMissingOptionalFields: true });
    if (Object.keys(errors).length > 0) {
        return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
    }
    Object.assign(existing, payload, { updated_at: new Date().toISOString() });
    return ok(existing);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission('patients.manage');
    if (denied) return denied;
    const { id } = await params;
    const patient = PATIENTS.find((candidate) => candidate.id === id);
    if (!patient) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    Object.assign(patient, { is_archived: true, archived_at: new Date().toISOString() });
    return new NextResponse(null, { status: 204 });
}
