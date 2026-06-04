import { list, requirePermission } from '../../_auth';
import { PATIENTS } from '../../_mock-data';

export async function GET() {
    // Backend gates `/lookups/patients` with `appointments.manage|payments.manage`
    // (see routes/api.php line 167-169). The endpoint is used by appointment-
    // create and quick-payment dialogs to autocomplete a patient; an
    // assistant without either permission would 403 in production.
    const denied = await requirePermission('appointments.manage', 'payments.manage');
    if (denied) return denied;
    const lookup = PATIENTS.map(({ id, patient_id, full_name, phone, secondary_phone }) => ({
        id,
        patient_id,
        full_name,
        phone,
        // Pass through the real `secondary_phone` from the seed when the
        // patient has one — the mock used to hardcode `null`, which meant
        // autocomplete UI looked empty in dev even though production would
        // return it.
        secondary_phone: secondary_phone ?? null,
    }));
    return list(lookup);
}
