const SAFE_URL_BASE = 'https://identa.invalid';

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
    role: string | null | undefined
): string {
    const fallback = role === 'admin' ? '/admin' : '/dashboard';

    // Admin sessions stay in the isolated admin portal. The regular login API
    // currently rejects admins, but this guard keeps that boundary explicit.
    if (role === 'admin' || !rawFrom || !rawFrom.startsWith('/') || rawFrom.startsWith('//')) {
        return fallback;
    }

    try {
        const destination = new URL(rawFrom, SAFE_URL_BASE);
        if (destination.origin !== SAFE_URL_BASE || !isProtectedAppPath(destination.pathname)) {
            return fallback;
        }

        return `${destination.pathname}${destination.search}`;
    } catch {
        return fallback;
    }
}
