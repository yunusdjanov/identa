import { NextResponse } from 'next/server';
import { requirePermission } from '../../../_auth';
import { PATIENTS, RECENT_PATIENT_IDS } from '../../../_mock-data';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission('patients.view');
    if (denied) return denied;

    const { id } = await params;
    if (!PATIENTS.some((patient) => patient.id === id && !patient.is_archived)) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    const existingIndex = RECENT_PATIENT_IDS.indexOf(id);
    if (existingIndex >= 0) {
        RECENT_PATIENT_IDS.splice(existingIndex, 1);
    }
    RECENT_PATIENT_IDS.unshift(id);
    RECENT_PATIENT_IDS.splice(5);

    return new NextResponse(null, { status: 204 });
}

/**
 * Local mock endpoint for removing one recent patient shortcut.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission('patients.view');
    if (denied) return denied;

    const { id } = await params;
    const index = RECENT_PATIENT_IDS.indexOf(id);
    if (index >= 0) {
        RECENT_PATIENT_IDS.splice(index, 1);
    }

    return new NextResponse(null, { status: 204 });
}
