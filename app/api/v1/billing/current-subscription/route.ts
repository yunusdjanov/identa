import { ok, requireDentist } from '../../_auth';
import { getAdminStore } from '@/lib/mock/admin-store';
import { BILLING_SUBSCRIPTION } from '../../_mock-data';

// The mock dentist session (/auth/me id: 'dentist-1') is the same person seeded
// in the admin store under id '1'. Looking up by the admin store key keeps the
// dentist portal in sync with admin-side actions (subscription updates, refunds,
// cancellations) — matching the production contract where the dentist GET
// returns canonical state.
const MOCK_DENTIST_ID = '1';

export async function GET() {
    // Backend `auth:sanctum + role:dentist` — assistants don't need the
    // subscription detail (their plan limits are inherited through
    // /auth/me which has the assistant-scrubbed view).
    const auth = await requireDentist();
    if (auth) return auth;

    const store = getAdminStore();
    const dentist = store.dentists.find((d) => d.id === MOCK_DENTIST_ID);
    if (!dentist) {
        // Fallback to the legacy static constant if the seeded dentist is
        // missing — keeps the route from 500ing in customised seeds.
        return ok(BILLING_SUBSCRIPTION);
    }

    return ok(dentist.subscription);
}
