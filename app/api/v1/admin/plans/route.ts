import { NextResponse } from 'next/server';
import { getAdminStore } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../_auth';

// Local mock: list subscription plans (admin editor).
export async function GET() {
    const auth = await requireAdmin();
    if (auth) return auth;
    return NextResponse.json({ data: getAdminStore().plans });
}
