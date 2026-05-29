import { NextResponse } from 'next/server';

// Local mock only. The real Laravel backend authenticates against seeded users
// and enforces the portal separation server-side; here we just branch on the
// login portal so the admin panel is reachable in local dev. The admin signs in
// via /admin/login, which posts `portal: 'admin'`.
const DENTIST_USER = {
    id: 'dentist-1',
    name: 'Zohid Yunusjonov',
    email: 'yunusdjanov@gmail.com',
    role: 'dentist',
    email_verified: true,
    subscription: {
        status: 'active',
        plan: 'pro',
        trial_ends_at: null,
        upload_max_mb: 8,
        stored_image_max_mb: 80,
        can_export: true,
        staff_limit: 5,
        entry_image_limit: 10,
    },
};

const ADMIN_USER = {
    id: 'admin-1',
    name: 'Identa Admin',
    email: 'admin@identa.test',
    role: 'admin',
    email_verified: true,
};

export async function POST(request: Request) {
    let portal = 'app';
    try {
        const body = await request.json();
        if (typeof body?.portal === 'string') {
            portal = body.portal;
        }
    } catch {
        // No JSON body — fall back to the default dentist session.
    }

    const isAdmin = portal === 'admin';
    const response = NextResponse.json({ data: isAdmin ? ADMIN_USER : DENTIST_USER });
    response.cookies.set('mock_session', '1', { httpOnly: true, path: '/' });
    response.cookies.set('mock_role', isAdmin ? 'admin' : 'dentist', { httpOnly: true, path: '/' });
    return response;
}
