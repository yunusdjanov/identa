import { NextResponse } from 'next/server';
import { getAdminStore } from '@/lib/mock/admin-store';

// Local mock: list subscription plans (admin editor).
export async function GET() {
    return NextResponse.json({ data: getAdminStore().plans });
}
