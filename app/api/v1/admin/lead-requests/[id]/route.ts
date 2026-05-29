import { NextResponse } from 'next/server';
import { getAdminStore, isoDaysFromNow } from '@/lib/mock/admin-store';

// Local mock: update a lead request's status (new / contacted / closed).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const lead = getAdminStore().leads.find((item) => item.id === id);
    if (!lead) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    if (body?.status === 'new' || body?.status === 'contacted' || body?.status === 'closed') {
        lead.status = body.status;
        lead.handled_at = body.status === 'new' ? null : isoDaysFromNow(0);
    }

    return NextResponse.json({ data: lead });
}
