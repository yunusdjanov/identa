import { NextResponse } from 'next/server';
import { requireAuth, list } from '../_auth';
import { PATIENTS } from '../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return list(PATIENTS, PATIENTS.length);
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    const body = await request.json();
    const patient = { id: `pat-${Date.now()}`, patient_id: `P-${String(PATIENTS.length + 1).padStart(3, '0')}`, is_archived: false, categories: [], created_at: new Date().toISOString(), last_visit_at: null, ...body };
    return NextResponse.json({ data: patient }, { status: 201 });
}
