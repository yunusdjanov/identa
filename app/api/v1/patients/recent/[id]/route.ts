import { NextResponse } from 'next/server';
import { requirePermission } from '../../../_auth';
import { RECENT_PATIENT_IDS } from '../../../_mock-data';

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
