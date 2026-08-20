import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { hasMockActiveAccessChain, resolveMockUser } from './_mock-users';

/**
 * Backend error responses are uniformly shaped `{ error: { code, message } }`
 * (see EnsureRole / EnsurePermission / EnsureSubscriptionAccess middleware).
 * The mock used to return `{ message }` directly, which meant the frontend's
 * `getApiErrorMessage` localised-message branches (lib/api/client.ts) never
 * triggered in mock-mode dev — devs saw the raw English string. Wrap all
 * mock denials in the same shape so the UI exercises the same path it will
 * in production.
 */
function envelope(code: string, message: string, status: number): NextResponse {
    return NextResponse.json({ error: { code, message } }, { status });
}

export async function requireAuth(): Promise<NextResponse | null> {
    const cookieStore = await cookies();
    if (!cookieStore.get('mock_session')) {
        return envelope('unauthenticated', 'Unauthenticated.', 401);
    }
    const role = cookieStore.get('mock_role')?.value;
    const userId = cookieStore.get('mock_user_id')?.value;
    if (!hasMockActiveAccessChain(role, userId)) {
        return envelope('account_inactive', 'Account is inactive.', 403);
    }
    return null;
}

/**
 * Resolve whether the current cookie-based mock session belongs to a
 * user with `payments.view`. Used by routes that embed financial fields
 * in their response so the mock mirrors the real backend's
 * Resource-layer gating: an assistant without payments.view receives
 * the record without the financial keys. Dentists and admins always
 * pass — only assistants are scoped by `assistant_permissions`.
 */
export async function canViewFinancials(): Promise<boolean> {
    const cookieStore = await cookies();
    const role = cookieStore.get('mock_role')?.value;
    const userId = cookieStore.get('mock_user_id')?.value;
    if (role === 'dentist' || role === 'admin') {
        return true;
    }
    if (role === 'assistant') {
        const user = resolveMockUser(role, userId);
        return (user.assistant_permissions ?? []).includes('payments.view');
    }
    return false;
}

/**
 * Gate admin-only mock routes. Mirrors the production middleware chain
 * `auth:sanctum` + `role:admin` — without this check, any logged-out client
 * could hit the mock admin endpoints (refund, deactivate plans, etc.).
 */
export async function requireAdmin(): Promise<NextResponse | null> {
    const cookieStore = await cookies();
    if (!cookieStore.get('mock_session')) {
        return envelope('unauthenticated', 'Unauthenticated.', 401);
    }
    const role = cookieStore.get('mock_role')?.value;
    const userId = cookieStore.get('mock_user_id')?.value;
    if (role !== 'admin') {
        return envelope('forbidden', 'Forbidden.', 403);
    }
    if (!hasMockActiveAccessChain(role, userId)) {
        return envelope('account_inactive', 'Account is inactive.', 403);
    }
    return null;
}

/**
 * Gate dentist-only mock routes. Mirrors `auth:sanctum + role:dentist`
 * from the real backend — used by billing, team management, and any
 * other surface that's the practice owner's concern only. Without this
 * check, assistants logged into the mock could read or modify owner-
 * scoped data (subscription, staff list, etc.).
 */
export async function requireDentist(): Promise<NextResponse | null> {
    const cookieStore = await cookies();
    if (!cookieStore.get('mock_session')) {
        return envelope('unauthenticated', 'Unauthenticated.', 401);
    }
    const role = cookieStore.get('mock_role')?.value;
    const userId = cookieStore.get('mock_user_id')?.value;
    if (role !== 'dentist') {
        return envelope('forbidden', 'Forbidden.', 403);
    }
    if (!hasMockActiveAccessChain(role, userId)) {
        return envelope('account_inactive', 'Account is inactive.', 403);
    }
    return null;
}

/**
 * Gate a mock route by one or more backend `permission:X` checks. Mirrors
 * EnsurePermission middleware: dentist + admin always pass, assistant
 * passes only if any of the supplied permissions appears in
 * `assistant_permissions`. Returns a 401/403 NextResponse on denial, or
 * null on success — same convention as requireAuth / requireDentist so
 * route handlers can `return denied ?? handler()`.
 *
 * Without this, mock routes silently let every authed session through —
 * tests pass against the mock that real backend would 403, masking
 * permission regressions in dev (Audit 10, finding #4).
 */
export async function requirePermission(...permissions: string[]): Promise<NextResponse | null> {
    const cookieStore = await cookies();
    if (!cookieStore.get('mock_session')) {
        return envelope('unauthenticated', 'Unauthenticated.', 401);
    }
    const role = cookieStore.get('mock_role')?.value;
    const userId = cookieStore.get('mock_user_id')?.value;
    if (!hasMockActiveAccessChain(role, userId)) {
        return envelope('account_inactive', 'Account is inactive.', 403);
    }
    if (role === 'dentist' || role === 'admin') {
        return null;
    }
    if (role === 'assistant') {
        const user = resolveMockUser(role, userId);
        const granted = new Set(user.assistant_permissions ?? []);
        if (permissions.some((permission) => granted.has(permission))) {
            return null;
        }
    }
    return envelope('forbidden', 'Forbidden.', 403);
}

/**
 * Permission gate for the dentist workspace. Production application routes
 * admit dentists and assistants only; admins use the isolated /admin API.
 */
export async function requirePracticePermission(...permissions: string[]): Promise<NextResponse | null> {
    const denied = await requirePermission(...permissions);
    if (denied) return denied;

    const cookieStore = await cookies();
    const role = cookieStore.get('mock_role')?.value;
    return role === 'dentist' || role === 'assistant'
        ? null
        : envelope('forbidden', 'Forbidden.', 403);
}

/**
 * Resolve whether the current cookie-based mock session has a given
 * staff permission. Mirrors User::hasPermission on the backend:
 *  - dentist and admin always pass
 *  - assistant is gated by their assistant_permissions array
 *  - everyone else fails closed
 *
 * Used by routes that need finer-grained gating than role alone — e.g.
 * /payments needs `payments.view` to read and `payments.manage` to
 * mutate, which is two different gates on the same role.
 */
export async function hasMockPermission(permission: string): Promise<boolean> {
    const cookieStore = await cookies();
    const role = cookieStore.get('mock_role')?.value;
    const userId = cookieStore.get('mock_user_id')?.value;
    if (!hasMockActiveAccessChain(role, userId)) {
        return false;
    }
    if (role === 'dentist' || role === 'admin') {
        return true;
    }
    if (role === 'assistant') {
        const user = resolveMockUser(role, userId);
        return (user.assistant_permissions ?? []).includes(permission);
    }
    return false;
}

/**
 * 403 response for permission-denied mock routes. Mirrors the real
 * backend's `EnsurePermission` middleware response shape so frontend
 * error handling stays consistent across mock and prod.
 */
export function forbidden(message = 'Forbidden.', code = 'forbidden'): NextResponse {
    return envelope(code, message, 403);
}

export function ok<T>(data: T) {
    return NextResponse.json({ data });
}

export function list<T>(data: T[], total?: number) {
    return NextResponse.json({
        data,
        meta: { pagination: { page: 1, per_page: 50, total: total ?? (data as unknown[]).length, total_pages: 1 } },
    });
}
