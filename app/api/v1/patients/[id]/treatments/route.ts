import { NextResponse } from 'next/server';
import { requireAuth, list } from '../../../_auth';
import { TREATMENTS } from '../../../_mock-data';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const items = TREATMENTS.filter((t) => t.patient_id === id);
    return list(items);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const body = await request.json();
    const treatment = { id: `trt-${Date.now()}`, patient_id: id, debt_amount: body.cost ?? 0, paid_amount: 0, balance: -(body.cost ?? 0), image_count: 0, images: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
    return NextResponse.json({ data: treatment }, { status: 201 });
}
