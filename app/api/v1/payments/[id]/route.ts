import { NextResponse } from 'next/server';
import { forbidden, hasMockPermission, requireAuth } from '../../_auth';
import { PAYMENTS } from '../../_mock-data';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.manage'))) {
        return forbidden();
    }
    const { id } = await params;
    const body = await request.json();
    const pay = { ...(PAYMENTS.find((p) => p.id === id) ?? PAYMENTS[0]), ...body };
    return NextResponse.json({ data: pay });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.manage'))) {
        return forbidden();
    }
    await params;
    return NextResponse.json({ message: 'Deleted.' });
}
