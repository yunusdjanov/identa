import { NextResponse } from 'next/server';
import { forbidden, hasMockPermission, ok, requireAuth } from '../../_auth';
import { INVOICES } from '../../_mock-data';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.view'))) {
        return forbidden();
    }
    const { id } = await params;
    const inv = INVOICES.find((i) => i.id === id) ?? INVOICES[0];
    return ok({ ...inv, items: [] });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.manage'))) {
        return forbidden();
    }
    const { id } = await params;
    const body = await request.json();
    const inv = { ...(INVOICES.find((i) => i.id === id) ?? INVOICES[0]), ...body };
    return ok(inv);
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
