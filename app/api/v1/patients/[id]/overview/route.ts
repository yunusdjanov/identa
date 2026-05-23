import { requireAuth, ok } from '../../../_auth';
import { APPOINTMENTS, TREATMENTS } from '../../../_mock-data';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const upcoming = APPOINTMENTS.filter((a) => a.patient_id === id && a.status === 'scheduled').slice(0, 3);
    const treatments = TREATMENTS.filter((t) => t.patient_id === id);
    const total_debt = treatments.reduce((s, t) => s + t.debt_amount, 0);
    const total_paid = treatments.reduce((s, t) => s + t.paid_amount, 0);
    return ok({ appointment_count: APPOINTMENTS.filter((a) => a.patient_id === id).length, upcoming_appointments: upcoming, total_debt, total_paid, total_balance: total_debt - total_paid });
}
