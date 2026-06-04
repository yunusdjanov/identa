import { NextResponse } from 'next/server';
import { list, requirePermission } from '../_auth';
import { CATEGORIES } from '../_mock-data';

export async function GET() {
    // Patient categories are scoped to `patients.view` on the backend
    // (routes/api.php line 158). Without this gate the mock leaked the
    // category list to assistants without patients.view.
    const denied = await requirePermission('patients.view');
    if (denied) return denied;
    return list(CATEGORIES);
}

export async function POST(request: Request) {
    // POST gated by `patients.manage`.
    const denied = await requirePermission('patients.manage');
    if (denied) return denied;
    const body = await request.json();
    const cat = { id: `cat-${Date.now()}`, sort_order: CATEGORIES.length + 1, ...body };
    return NextResponse.json({ data: cat }, { status: 201 });
}
