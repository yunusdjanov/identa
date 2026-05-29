import { NextResponse } from 'next/server';
import { findDentist } from '@/lib/mock/admin-store';

// Local mock: show a single dentist / soft-delete (mark deleted).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }
    return NextResponse.json({ data: dentist });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const dentist = findDentist(id);
    if (dentist) {
        dentist.status = 'deleted';
    }
    return new NextResponse(null, { status: 204 });
}
