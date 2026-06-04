import { NextResponse } from 'next/server';

/**
 * Mock for the public password-reset endpoint hit after the user clicks
 * the email link. The real backend (AuthController::resetPassword) takes
 * `{ email, token, password, password_confirmation }`, validates the
 * token + complexity, atomically updates the password, revokes all
 * Sanctum tokens, sets `must_change_password=false`, and writes an audit
 * row. The mock is mode-only — it doesn't persist a new password since
 * the mock login accepts any password — but it returns the same envelope
 * the frontend expects (200 with `{ message }`), so the reset flow can be
 * exercised end-to-end in dev without spinning up the backend.
 *
 * Audit 10 finding: this route used to 404 in mock mode, masking any
 * regression in the reset flow until staging.
 */
export async function POST(request: Request) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const errors: Record<string, string[]> = {};

    if (typeof body.email !== 'string' || !body.email.includes('@')) {
        errors.email = ['A valid email is required.'];
    }
    if (typeof body.token !== 'string' || body.token.length < 8) {
        errors.token = ['Reset token is invalid or expired.'];
    }
    if (typeof body.password !== 'string' || body.password.length < 8) {
        errors.password = ['Password must be at least 8 characters.'];
    } else if (
        typeof body.password_confirmation !== 'string'
        || body.password !== body.password_confirmation
    ) {
        errors.password = ['Password confirmation does not match.'];
    } else if (
        !/[A-Za-z]/.test(body.password as string)
        || !/[0-9]/.test(body.password as string)
    ) {
        errors.password = ['Password must contain at least one letter and one number.'];
    }

    if (Object.keys(errors).length > 0) {
        return NextResponse.json(
            { message: 'The given data was invalid.', errors },
            { status: 422 },
        );
    }

    return NextResponse.json({ message: 'Password has been reset.' });
}
