import { NextResponse } from 'next/server';
import { findDentist } from '@/lib/mock/admin-store';

// Local mock: acknowledge an admin-initiated dentist password reset.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    return NextResponse.json({ data: { dentist_id: id, password_reset: true } });
}
