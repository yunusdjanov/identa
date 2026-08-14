import { NextResponse } from 'next/server';
import { requirePermission } from '../../../_auth';
import { APPOINTMENTS, PATIENTS, RECENT_PATIENT_IDS, TREATMENTS } from '../../../_mock-data';

// Mock stub for permanent (force) patient deletion. The real Laravel backend
// cascade-deletes all related records + purges storage files; locally we just
// acknowledge so the type-to-confirm delete flow can be exercised end-to-end.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const denied = await requirePermission('patients.manage');
    if (denied) return denied;
    const { id } = await params;
    const patientIndex = PATIENTS.findIndex((patient) => patient.id === id);
    if (patientIndex < 0) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    if (!PATIENTS[patientIndex].is_archived) {
        return NextResponse.json({
            message: 'The given data was invalid.',
            errors: { patient: ['Archive the patient before permanent deletion.'] },
        }, { status: 422 });
    }

    PATIENTS.splice(patientIndex, 1);
    for (let index = APPOINTMENTS.length - 1; index >= 0; index -= 1) {
        if (APPOINTMENTS[index].patient_id === id) APPOINTMENTS.splice(index, 1);
    }
    for (let index = TREATMENTS.length - 1; index >= 0; index -= 1) {
        if (TREATMENTS[index].patient_id === id) TREATMENTS.splice(index, 1);
    }
    const recentIndex = RECENT_PATIENT_IDS.indexOf(id);
    if (recentIndex >= 0) {
        RECENT_PATIENT_IDS.splice(recentIndex, 1);
    }

    return new NextResponse(null, { status: 204 });
}
