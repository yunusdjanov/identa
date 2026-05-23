import { NextResponse } from 'next/server';
import { requireAuth, list } from '../../_auth';
import { ASSISTANTS } from '../../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return list(ASSISTANTS);
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    const body = await request.json();
    const ast = { id: `ast-${Date.now()}`, account_status: 'active', must_change_password: true, last_login_at: null, created_at: new Date().toISOString(), assistant_permissions: [], ...body };
    return NextResponse.json({ data: ast }, { status: 201 });
}
