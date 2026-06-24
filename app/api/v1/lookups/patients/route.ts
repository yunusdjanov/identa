import { list, requirePermission } from '../../_auth';
import { PATIENTS } from '../../_mock-data';

function normalize(value: string | null | undefined): string {
    return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchesSearch(patient: (typeof PATIENTS)[number], search: string): boolean {
    const normalizedSearch = normalize(search);
    if (!normalizedSearch) {
        return true;
    }

    const digitsSearch = normalizedSearch.replace(/\D/g, '');
    const haystack = normalize([
        patient.full_name,
        patient.phone,
        patient.secondary_phone ?? '',
        patient.patient_id,
    ].join(' '));
    const digitHaystack = haystack.replace(/\D/g, '');

    return haystack.includes(normalizedSearch) || (digitsSearch !== '' && digitHaystack.includes(digitsSearch));
}

export async function GET(request: Request) {
    // Backend gates `/lookups/patients` with `appointments.manage|payments.manage`
    // (see routes/api.php line 167-169). The endpoint is used by appointment-
    // create and quick-payment dialogs to autocomplete a patient; an
    // assistant without either permission would 403 in production.
    const denied = await requirePermission('appointments.manage', 'payments.manage');
    if (denied) return denied;

    const url = new URL(request.url);
    const search = url.searchParams.get('filter[search]') ?? url.searchParams.get('search') ?? '';
    const perPage = parseInt(url.searchParams.get('per_page') ?? '20', 10) || 20;
    const filtered = PATIENTS.filter((patient) => matchesSearch(patient, search));
    const lookup = filtered.slice(0, perPage).map(({ id, patient_id, full_name, phone, secondary_phone }) => ({
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
    return list(lookup, filtered.length);
}
