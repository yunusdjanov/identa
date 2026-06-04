import { NextResponse } from 'next/server';
import { forbidden, hasMockPermission, list, requireAuth } from '../_auth';
import { PAYMENTS } from '../_mock-data';

// Mock parity with backend's `payments.view` / `payments.manage` route
// gates (see api.php). Without these checks an assistant logged into
// the mock (Zulfiya or Madina, who have no payment perms) could read
// every payment in the practice and even mutate them — a far worse
// state than the real backend, where the route is 403'd.
export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.view'))) {
        return forbidden();
    }
    return list(PAYMENTS, PAYMENTS.length);
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.manage'))) {
        return forbidden();
    }
    const body = await request.json();
    const pay = { id: `pay-${Date.now()}`, notes: null, created_at: new Date().toISOString(), ...body };
    return NextResponse.json({ data: pay }, { status: 201 });
}
