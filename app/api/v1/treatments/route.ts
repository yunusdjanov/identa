import { forbidden, hasMockPermission, list, requireAuth } from '../_auth';
import { TREATMENTS } from '../_mock-data';

// Cross-patient treatment list — used by the /payments page to surface
// outstanding debts across the entire practice. Real backend gates this
// endpoint with `payments.view` (api.php: `Route::get('treatments', ...)`).
// The patient-scoped sibling at `/patients/[id]/treatments` is gated by
// `patients.view` and scrubs financials at the row level. This sibling
// has no clinical use — viewers without `payments.view` should be
// 403'd entirely, not just receive scrubbed rows (otherwise they could
// still enumerate every treatment in the practice).
export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    if (!(await hasMockPermission('payments.view'))) {
        return forbidden();
    }
    return list(TREATMENTS, TREATMENTS.length);
}
