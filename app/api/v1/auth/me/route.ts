import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Local mock only — role is read back from the cookie set at login so the
// admin session survives page reloads in local dev.
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

export async function GET() {
    const cookieStore = await cookies();
    if (!cookieStore.get('mock_session')) {
        return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });
    }

    const isAdmin = cookieStore.get('mock_role')?.value === 'admin';

    return NextResponse.json({ data: isAdmin ? ADMIN_USER : DENTIST_USER });
}
