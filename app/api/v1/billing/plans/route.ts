import { requireAuth, list } from '../../_auth';
import { BILLING_PLANS } from '../../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return list(BILLING_PLANS);
}
