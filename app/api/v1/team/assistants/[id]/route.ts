import { NextResponse } from 'next/server';
import { requireAuth } from '../../../_auth';
import { ASSISTANTS } from '../../../_mock-data';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const body = await request.json();
    const ast = { ...(ASSISTANTS.find((a) => a.id === id) ?? ASSISTANTS[0]), ...body };
    return NextResponse.json({ data: ast });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    await params;
    return NextResponse.json({ message: 'Deleted.' });
}
