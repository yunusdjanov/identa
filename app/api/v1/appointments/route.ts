import { NextResponse } from 'next/server';
import { requireAuth, list } from '../_auth';
import { APPOINTMENTS } from '../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return list(APPOINTMENTS, APPOINTMENTS.length);
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    const body = await request.json();
    const apt = { id: `apt-${Date.now()}`, status: 'scheduled', notes: null, ...body };
    return NextResponse.json({ data: apt }, { status: 201 });
}
