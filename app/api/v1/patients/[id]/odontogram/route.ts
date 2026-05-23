import { NextResponse } from 'next/server';
import { requireAuth, list } from '../../../_auth';
import { ODONTOGRAM } from '../../../_mock-data';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const entries = (ODONTOGRAM[id] ?? []) as unknown[];
    return list(entries);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const body = await request.json();
    const entry = { id: `odo-${Date.now()}`, patient_id: id, images: [], created_at: new Date().toISOString(), ...body };
    return NextResponse.json({ data: entry }, { status: 201 });
}
