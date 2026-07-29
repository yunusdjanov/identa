import { NextResponse } from 'next/server';
import { findDentist, getAdminStore } from '@/lib/mock/admin-store';
import { requireAdmin } from '../../../../_auth';

// Local mock: full billing snapshot for one dentist (subscription + payments + usage).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAdmin();
    if (auth) return auth;

    const { id } = await params;
    const dentist = findDentist(id);
    if (!dentist) {
        return NextResponse.json({ message: 'Not found.' }, { status: 404 });
    }

    const store = getAdminStore();
    const allPayments = store.paymentsByDentist[id] ?? [];
    const payments = allPayments.slice(0, 100);
    const staff = store.staffByDentist[id] ?? [];
    const paidTotals = Object.values(
        allPayments
            .filter((payment) => payment.status === 'paid')
            .reduce<Record<string, {
                currency: string;
                total: number;
                paid_count: number;
            }>>((totals, payment) => {
                const currency = payment.currency || 'UZS';
                const row = totals[currency] ?? { currency, total: 0, paid_count: 0 };
                row.total += payment.amount;
                row.paid_count += 1;
                totals[currency] = row;
                return totals;
            }, {})
    ).sort((a, b) => b.total - a.total);

    return NextResponse.json({
        data: {
            dentist,
            subscription: dentist.subscription,
            payments,
            payment_history: {
                total: allPayments.length,
                limit: 100,
                truncated: allPayments.length > 100,
                paid_count: paidTotals.reduce((sum, row) => sum + row.paid_count, 0),
                paid_totals_by_currency: paidTotals,
            },
            staff: {
                active: staff.filter((member) => member.account_status === 'active').length,
                total: staff.length,
            },
            usage: {
                patients: dentist.patient_count,
                appointments: dentist.appointment_count,
                payments: allPayments.length,
            },
        },
    });
}
