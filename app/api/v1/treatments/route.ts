import { requireAuth, list } from '../_auth';
import { TREATMENTS } from '../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return list(TREATMENTS, TREATMENTS.length);
}
