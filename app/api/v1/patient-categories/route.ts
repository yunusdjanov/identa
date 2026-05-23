import { NextResponse } from 'next/server';
import { requireAuth, list } from '../_auth';
import { CATEGORIES } from '../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return list(CATEGORIES);
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    const body = await request.json();
    const cat = { id: `cat-${Date.now()}`, sort_order: CATEGORIES.length + 1, ...body };
    return NextResponse.json({ data: cat }, { status: 201 });
}
