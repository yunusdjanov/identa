import { NextResponse } from 'next/server';
import { ok, requirePermission } from '../../../_auth';
import { PATIENTS } from '../../../_mock-data';

// Mock stub for restoring an archived patient.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission('patients.manage');
    if (denied) return denied;
    const { id } = await params;
    const patient = PATIENTS.find((candidate) => candidate.id === id);
    if (!patient) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    Object.assign(patient, { is_archived: false, archived_at: null });
    return ok(patient);
}
