import { NextResponse } from 'next/server';
import { requireAuth, list } from '../_auth';
import { PAYMENTS } from '../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return list(PAYMENTS, PAYMENTS.length);
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    const body = await request.json();
    const pay = { id: `pay-${Date.now()}`, notes: null, created_at: new Date().toISOString(), ...body };
    return NextResponse.json({ data: pay }, { status: 201 });
}
