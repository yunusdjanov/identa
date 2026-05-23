import { NextResponse } from 'next/server';
import { requireAuth } from '../../../../_auth';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    return NextResponse.json({ data: { assistant_id: id, password_reset: true } });
}
