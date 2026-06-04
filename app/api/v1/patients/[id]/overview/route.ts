import { canViewFinancials, requireAuth, ok } from '../../../_auth';
import { APPOINTMENTS, TREATMENTS } from '../../../_mock-data';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireAuth();
    if (auth) return auth;
    const { id } = await params;
    const canSeeFinancials = await canViewFinancials();
    const upcoming = APPOINTMENTS.filter((a) => a.patient_id === id && a.status === 'scheduled').slice(0, 3);
    const treatments = TREATMENTS.filter((t) => t.patient_id === id);
    // Mirror PatientService::overview's includePayments gate. Without
    // this, an assistant lacking payments.view would still read the
    // patient's outstanding balance via the network panel even though
    // the UI (VitalStatCell open-balance, clinical-snapshot net-balance
    // chip, treatment-history summary cards) hides them.
    const total_debt = canSeeFinancials ? treatments.reduce((s, t) => s + t.debt_amount, 0) : 0;
    const total_paid = canSeeFinancials ? treatments.reduce((s, t) => s + t.paid_amount, 0) : 0;
    return ok({
        appointment_count: APPOINTMENTS.filter((a) => a.patient_id === id).length,
        upcoming_appointments: upcoming,
        total_debt,
        total_paid,
        total_balance: total_debt - total_paid,
    });
}
