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
    const debtAmount = Number(body.debt_amount ?? body.cost ?? 0);
    const paidAmount = Number(body.paid_amount ?? 0);
    const treatment = {
        id: `trt-${Date.now()}`,
        patient_id: id,
        image_count: 0,
        images: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...body,
        debt_amount: debtAmount,
        paid_amount: paidAmount,
        balance: Math.max(0, debtAmount - paidAmount),
    };
    return NextResponse.json({ data: treatment }, { status: 201 });
}
