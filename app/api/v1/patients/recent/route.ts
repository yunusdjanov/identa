import { NextResponse } from 'next/server';
import { requirePermission } from '../../_auth';
import { PATIENTS, RECENT_PATIENT_IDS } from '../../_mock-data';

/**
 * Local mock endpoint for profile-scoped recently opened patients.
 */
export async function GET() {
    const denied = await requirePermission('patients.view');
    if (denied) return denied;

    const data = RECENT_PATIENT_IDS
        .map((id) => PATIENTS.find((patient) => patient.id === id))
        .filter((patient): patient is (typeof PATIENTS)[number] => patient !== undefined && !patient.is_archived)
        .slice(0, 5)
        .map((patient) => ({
            id: patient.id,
            full_name: patient.full_name,
        }));

    return NextResponse.json({ data });
}

/**
 * Local mock endpoint for clearing recent patient shortcuts.
 */
export async function DELETE() {
    const denied = await requirePermission('patients.view');
    if (denied) return denied;

    RECENT_PATIENT_IDS.splice(0);

    return new NextResponse(null, { status: 204 });
}
