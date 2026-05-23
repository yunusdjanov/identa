import { requireAuth, ok } from '../../_auth';
import { BILLING_SUBSCRIPTION } from '../../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return ok(BILLING_SUBSCRIPTION);
}
