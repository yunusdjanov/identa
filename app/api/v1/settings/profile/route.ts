import { requireAuth, ok } from '../../_auth';
import { PROFILE } from '../../_mock-data';

export async function GET() {
    const auth = await requireAuth();
    if (auth) return auth;
    return ok(PROFILE);
}

export async function PUT(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;
    const body = await request.json();
    return ok({ ...PROFILE, ...body });
}
