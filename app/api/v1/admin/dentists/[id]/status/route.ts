import { NextResponse } from 'next/server';
import { findDentist } from '@/lib/mock/admin-store';

// Local mock: block / activate a dentist account.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    if (body?.status === 'active' || body?.status === 'blocked') {
        dentist.status = body.status;
    }

    return NextResponse.json({ data: dentist });
}
