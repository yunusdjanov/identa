import { requireAuth, list } from '../_auth';
import { AUDIT_LOGS } from '../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return list(AUDIT_LOGS);
}
