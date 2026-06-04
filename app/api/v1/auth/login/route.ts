import { NextResponse } from 'next/server';
import { resolveLoginUser } from '../../_mock-users';

// Local mock only. The real Laravel backend authenticates against seeded
// users and enforces the portal separation server-side; here we just
// branch on the login portal and posted email to decide which fixture to
// return. The admin signs in via /admin/login (which posts `portal: 'admin'`);
// any of the seeded assistant emails will return an assistant fixture so
// the assistant UX is reachable in local dev. Anything else falls through
// to the dentist owner.
//
// Recognised test emails (any password works in mock mode):
//   - admin@identa.test               → ADMIN_USER
//   - zulfiya@identa.uz               → ASSISTANT (full perms)
//   - sardor@identa.uz                → ASSISTANT (payments-only perms)
//   - madina@identa.uz                → ASSISTANT (must_change_password=true)
//   - anything else                   → DENTIST_USER

export async function POST(request: Request) {
    let body: unknown = {};
    try {
        body = await request.json();
    } catch {
        // No JSON body — fall back to defaults.
    }

    const user = resolveLoginUser(body as { email?: unknown; portal?: unknown });

    const response = NextResponse.json({ data: user });
    response.cookies.set('mock_session', '1', { httpOnly: true, path: '/' });
    response.cookies.set('mock_role', user.role, { httpOnly: true, path: '/' });
    // `mock_user_id` lets /auth/me distinguish between assistants (which
    // share the role) without forcing the request to re-send the email.
    // For dentist/admin where there's only one fixture per role it's
    // redundant but cheap, and keeps the resolution code symmetric.
    response.cookies.set('mock_user_id', user.id, { httpOnly: true, path: '/' });
    return response;
}
