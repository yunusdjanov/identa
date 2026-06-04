import { list, requirePermission } from '../../_auth';
import { APPOINTMENTS } from '../../_mock-data';

export async function GET() {
    // Backend gates `/lookups/appointments` with `payments.manage` — the
    // endpoint is used by the global payment-create dialog to attach a
    // payment to an existing appointment. Assistants without
    // payments.manage 403 in production; mock must match.
    const denied = await requirePermission('payments.manage');
    if (denied) return denied;
    const lookup = APPOINTMENTS.map(({ id, appointment_date, start_time, patient_name, status }) => ({ id, appointment_date, start_time, patient_name, status }));
    return list(lookup);
}
