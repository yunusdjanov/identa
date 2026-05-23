import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../_auth';
import { ASSISTANTS } from '../../../../_mock-data';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const body = await request.json();
    const ast = { ...(ASSISTANTS.find((a) => a.id === id) ?? ASSISTANTS[0]), account_status: body.status ?? 'active' };
    return NextResponse.json({ data: ast });
}
