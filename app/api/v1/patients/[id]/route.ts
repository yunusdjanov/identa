import { NextResponse } from 'next/server';
import { requireAuth, ok } from '../../_auth';
import { PATIENTS, RECENT_PATIENT_IDS } from '../../_mock-data';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const patient = PATIENTS.find((p) => p.id === id) ?? PATIENTS[0];
    if (patient?.id) {
        const existingIndex = RECENT_PATIENT_IDS.indexOf(patient.id);
        if (existingIndex >= 0) {
            RECENT_PATIENT_IDS.splice(existingIndex, 1);
        }
        RECENT_PATIENT_IDS.unshift(patient.id);
        RECENT_PATIENT_IDS.splice(5);
    }
    return ok(patient);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const body = await request.json();
    const patient = { ...(PATIENTS.find((p) => p.id === id) ?? PATIENTS[0]), ...body };
    return ok(patient);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    await params;
    return NextResponse.json({ message: 'Archived.' });
}
