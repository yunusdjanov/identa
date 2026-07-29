import type { ApiUser } from '@/lib/api/types';
import { canView, canViewAnalytics } from '@/lib/auth/permissions';

const SAFE_URL_BASE = 'https://identa.invalid';

type PostLoginUser = Pick<
    ApiUser,
    'role' | 'assistant_permissions' | 'account_status'
>;

export const APP_PROTECTED_PATH_PREFIXES = [
    '/dashboard',
    '/patients',
    '/appointments',
    '/payments',
    '/billing',
    '/settings',
    '/staff',
    '/team',
    '/analytics',
] as const;

export function isProtectedAppPath(pathname: string): boolean {
    return APP_PROTECTED_PATH_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
}

/**
 * Resolves an untrusted `?from=` value to an in-app post-login destination.
 * Only known protected app routes are accepted, so this cannot become an
 * open redirect or bounce a user into another authentication surface.
 */
export function resolvePostLoginDestination(
    rawFrom: string | null | undefined,
    userOrRole: PostLoginUser | string | null | undefined
): string {
    const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
    const user = typeof userOrRole === 'object' ? userOrRole : null;
    const fallback = role === 'admin' ? '/admin' : '/dashboard';
    const permissionAwareFallback = user?.role === 'assistant'
        ? (
            canView(user as ApiUser, 'appointments')
                ? '/dashboard'
                : canView(user as ApiUser, 'patients')
                    ? '/patients'
                    : canView(user as ApiUser, 'payments')
                        ? '/payments'
                        : '/settings'
        )
        : fallback;

    // Admin sessions stay in the isolated admin portal. The regular login API
    // currently rejects admins, but this guard keeps that boundary explicit.
    if (role === 'admin' || !rawFrom || !rawFrom.startsWith('/') || rawFrom.startsWith('//')) {
        return role === 'admin' ? fallback : permissionAwareFallback;
    }

    try {
        const destination = new URL(rawFrom, SAFE_URL_BASE);
        if (destination.origin !== SAFE_URL_BASE || !isProtectedAppPath(destination.pathname)) {
            return permissionAwareFallback;
        }

        if (user?.role === 'assistant' && !canAssistantOpenPath(user, destination.pathname)) {
            return permissionAwareFallback;
        }

        return `${destination.pathname}${destination.search}`;
    } catch {
        return permissionAwareFallback;
    }
}

function canAssistantOpenPath(user: PostLoginUser, pathname: string): boolean {
    if (pathname === '/settings' || pathname.startsWith('/settings/')) {
        return true;
    }
    if (pathname === '/analytics' || pathname.startsWith('/analytics/')) {
        return canViewAnalytics(user as ApiUser);
    }
    if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
        return canView(user as ApiUser, 'appointments');
    }
    if (pathname === '/appointments' || pathname.startsWith('/appointments/')) {
        return canView(user as ApiUser, 'appointments');
    }
    if (pathname === '/patients' || pathname.startsWith('/patients/')) {
        return canView(user as ApiUser, 'patients');
    }
    if (pathname === '/payments' || pathname.startsWith('/payments/')) {
        return canView(user as ApiUser, 'payments');
    }

    return false;
}
