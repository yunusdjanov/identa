import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireAuth } from '../../_auth';
import { resolveMockUser, updateMockUserSecurity } from '../../_mock-users';

function validationFailure(errors: Record<string, string[]>) {
    return NextResponse.json({ message: 'Validation failed.', errors }, { status: 422 });
}

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth) return auth;

    const body = await request.json().catch(() => null);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return validationFailure({ request: ['The request body must be an object.'] });
    }

    const cookieStore = await cookies();
    const role = cookieStore.get('mock_role')?.value;
    const userId = cookieStore.get('mock_user_id')?.value;
    const baseUser = resolveMockUser(role, userId);
    const payload = body as Record<string, unknown>;
    const errors: Record<string, string[]> = {};
    const password = payload.new_password;
    const confirmation = payload.new_password_confirmation;
    const requiresCurrentPassword = !baseUser.must_change_password && baseUser.has_password !== false;

    if (requiresCurrentPassword
        && (typeof payload.current_password !== 'string' || payload.current_password.length === 0)) {
        errors.current_password = ['The current password is required.'];
    }
    if (typeof password !== 'string' || password.length < 8) {
        errors.new_password = ['The new password must be at least 8 characters.'];
    } else if (password.length > 255) {
        errors.new_password = ['The new password may not be greater than 255 characters.'];
    } else if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
        errors.new_password = ['The new password must contain letters and numbers.'];
    }
    if (confirmation !== password) {
        errors.new_password_confirmation = ['The password confirmation does not match.'];
    }

    if (Object.keys(errors).length > 0) {
        return validationFailure(errors);
    }

    const refreshed = updateMockUserSecurity(baseUser.id, {
        must_change_password: false,
        has_password: true,
    }) ?? baseUser;

    return NextResponse.json({ data: refreshed });
}
