import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { resolveMockUser } from '../../_mock-users';

// Local mock only — role + user id are read back from cookies set at
// login so the session survives page reloads in local dev. Three
// assistant fixtures are available; see `_mock-users.ts` for the lookup
// table and the test scenarios each one exercises (full perms, partial
// perms, forced password change).
export async function GET() {
    const cookieStore = await cookies();
    if (!cookieStore.get('mock_session')) {
        return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });
    }

    const role = cookieStore.get('mock_role')?.value;
    const userId = cookieStore.get('mock_user_id')?.value;
    return NextResponse.json({ data: resolveMockUser(role, userId) });
}
