import { requireAuth, list } from '../../_auth';
import { PATIENTS } from '../../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    const lookup = PATIENTS.map(({ id, patient_id, full_name, phone }) => ({ id, patient_id, full_name, phone, secondary_phone: null }));
    return list(lookup);
}
