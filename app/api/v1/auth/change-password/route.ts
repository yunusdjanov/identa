import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAuth } from '../../_auth';
import { resolveMockUser } from '../../_mock-users';

// Local mock: change-password.
//
// The frontend client (changeCurrentPassword in lib/api/dentist.ts) types the
// response as ApiEnvelope<ApiUser> and feeds `data.data` straight into
// `queryClient.setQueryData(['auth', 'me'], updatedUser)`. If we return only
// a {message: ...} envelope, `data.data` is undefined and the cache flip
// effectively logs the user out. Return the same shape /auth/me does so the
// post-change auth state stays coherent.
//
// We delegate to `resolveMockUser` so an assistant who hit this endpoint
// because of the forced-reset banner (e.g. Madina fixture, AF1) gets her
// OWN refreshed user back — not the dentist fixture. Without this, the
// cache flip would overwrite her assistant state with the dentist owner's
// data and break the rest of the session.
export async function POST() {
    const auth = await requireAuth();
    if (auth) return auth;

    const cookieStore = await cookies();
    const role = cookieStore.get('mock_role')?.value;
    const userId = cookieStore.get('mock_user_id')?.value;
    const baseUser = resolveMockUser(role, userId);

    // Clear `must_change_password` because the user just rotated. This is
    // the contract that lets the Settings tab lock and layout redirect
    // disengage — the next `/auth/me` read will return the same shape.
    const refreshed = {
        ...baseUser,
        must_change_password: false,
        has_password: true,
    };

    return NextResponse.json({ data: refreshed });
}
