import { requireAuth, list } from '../../_auth';
import { APPOINTMENTS } from '../../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    const lookup = APPOINTMENTS.map(({ id, appointment_date, start_time, patient_name, status }) => ({ id, appointment_date, start_time, patient_name, status }));
    return list(lookup);
}
