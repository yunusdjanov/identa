import { NextResponse } from 'next/server';
import { requireAuth } from '../../_auth';

export async function POST() {
    const auth = await requireAuth();
    if (auth) return auth;
    return NextResponse.json({ message: 'Password changed.' });
}
