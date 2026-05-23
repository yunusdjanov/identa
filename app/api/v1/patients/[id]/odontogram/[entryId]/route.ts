import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../_auth';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id, entryId } = await params;
    const body = await request.json();
    return NextResponse.json({ data: { id: entryId, patient_id: id, images: [], ...body } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; entryId: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    await params;
    return NextResponse.json({ message: 'Deleted.' });
}
