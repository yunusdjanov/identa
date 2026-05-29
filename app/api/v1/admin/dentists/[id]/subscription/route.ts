import { NextResponse } from 'next/server';
import { applySubscriptionAction, findDentist } from '@/lib/mock/admin-store';

// Local mock: admin subscription management (set plan, mark read-only/active, cancel...).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    if (body?.action) {
        applySubscriptionAction(
            dentist,
            body.action,
            body.payment_method,
            typeof body.payment_amount === 'number' ? body.payment_amount : undefined,
            typeof body.note === 'string' ? body.note : undefined
        );
    }

    return NextResponse.json({ data: dentist });
}
