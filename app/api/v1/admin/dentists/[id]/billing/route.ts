import { NextResponse } from 'next/server';
import { findDentist, getAdminStore } from '@/lib/mock/admin-store';

// Local mock: full billing snapshot for one dentist (subscription + payments + usage).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const store = getAdminStore();
    const payments = store.paymentsByDentist[id] ?? [];
    const staff = store.staffByDentist[id] ?? [];

    return NextResponse.json({
        data: {
            dentist,
            subscription: dentist.subscription,
            payments,
            staff: {
                active: staff.filter((member) => member.account_status === 'active').length,
                total: staff.length,
            },
            usage: {
                patients: dentist.patient_count,
                appointments: dentist.appointment_count,
                payments: payments.length,
            },
        },
    });
}
