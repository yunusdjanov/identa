import { NextResponse } from 'next/server';
import { requireAuth, ok } from '../../../../_auth';
import { TREATMENTS } from '../../../../_mock-data';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; treatmentId: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id, treatmentId } = await params;
    const treatment = TREATMENTS.find((t) => t.id === treatmentId && t.patient_id === id) ?? TREATMENTS[0];
    return ok(treatment);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; treatmentId: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id, treatmentId } = await params;
    const body = await request.json();
    const treatment = { ...(TREATMENTS.find((t) => t.id === treatmentId && t.patient_id === id) ?? TREATMENTS[0]), ...body };
    return ok(treatment);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; treatmentId: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    await params;
    return NextResponse.json({ message: 'Deleted.' });
}
