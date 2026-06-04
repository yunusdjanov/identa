import { list, requireDentist } from '../../_auth';
import { getAdminStore } from '@/lib/mock/admin-store';
import { BILLING_PAYMENTS } from '../../_mock-data';

// The mock dentist session is hardcoded to Zohid. /auth/me exposes that user
// with id 'dentist-1', while the admin store seeds the same person under
// numeric id '1' (so admin URLs read /admin/dentists/1/...). They refer to
// the same dentist — we look up by the admin store key here so refunds and
// admin-side subscription mutations are reflected on the dentist portal.
const MOCK_DENTIST_ID = '1';

export async function GET() {
    // Dentist-only — assistants must not see the practice's payment
    // history. Backend gates with `role:dentist`.
    const auth = await requireDentist();
    if (auth) return auth;

    const store = getAdminStore();
    const payments = store.paymentsByDentist[MOCK_DENTIST_ID];
    if (!payments) {
        // Legacy fallback if the seeded dentist isn't present in the store.
        return list(BILLING_PAYMENTS);
    }

    // Newest first — matches Laravel's `orderByDesc('created_at')`.
    const ordered = [...payments].sort((a, b) => {
        const at = new Date(a.created_at ?? 0).getTime();
        const bt = new Date(b.created_at ?? 0).getTime();
        return bt - at;
    });

    return list(ordered);
}
