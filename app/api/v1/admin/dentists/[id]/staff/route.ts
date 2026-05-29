import { NextResponse } from 'next/server';
import { getAdminStore } from '@/lib/mock/admin-store';

// Local mock: list a dentist's assistants (read-only admin view).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const staff = getAdminStore().staffByDentist[id] ?? [];
    return NextResponse.json({ data: staff });
}
