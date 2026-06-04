import { NextRequest, NextResponse } from 'next/server';

const CANONICAL_HOST = 'identa.uz';
const WWW_HOST = 'www.identa.uz';
const AUTHENTICATED_LOGIN_PATHS = new Set(['/login', '/admin/login']);
const SESSION_COOKIE_NAMES = ['identa-session', 'identa_session', 'laravel-session', 'laravel_session'];
const LARAVEL_REMEMBER_COOKIE_PREFIX = 'remember_web_';

// Mock-mode cookies set by the in-app mock API (`app/api/v1/*`). Production
// (Laravel + Sanctum) never sets these — there `mockModeActive` is false and
// the gate becomes a no-op (the client `useEffect` redirect + backend
// `role:admin` middleware remain the only enforcement, same as before).
const MOCK_SESSION_COOKIE = 'mock_session';
const MOCK_ROLE_COOKIE = 'mock_role';

export function normalizeApiRootUrl(): string {
    const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL
        ?? process.env.API_URL
        ?? 'http://127.0.0.1:8001/api';
    const normalizedApiUrl = configuredApiUrl.replace(/\/+$/, '');
    const apiUrlWithoutVersion = normalizedApiUrl.replace(/\/api\/v\d+$/i, '/api');

    return apiUrlWithoutVersion.endsWith('/api') ? apiUrlWithoutVersion : `${apiUrlWithoutVersion}/api`;
}

export function isAuthCookieName(cookieName: string): boolean {
    return SESSION_COOKIE_NAMES.includes(cookieName) || cookieName.startsWith(LARAVEL_REMEMBER_COOKIE_PREFIX);
}

function hasAuthCookie(request: NextRequest): boolean {
    return request.cookies.getAll().some((cookie) => isAuthCookieName(cookie.name) && Boolean(cookie.value));
}

function normalizePathname(pathname: string): string {
    if (pathname !== '/' && pathname.endsWith('/')) {
        return pathname.slice(0, -1);
    }

    return pathname;
}

async function resolveAuthenticatedDestination(request: NextRequest): Promise<string | null> {
    if (!hasAuthCookie(request)) {
        return null;
    }

    try {
        const requestOrigin = `${request.nextUrl.protocol}//${request.headers.get('host') ?? request.nextUrl.host}`;
        const response = await fetch(`${normalizeApiRootUrl()}/v1/auth/me`, {
            headers: {
                Accept: 'application/json',
                Cookie: request.headers.get('cookie') ?? '',
                Origin: requestOrigin,
                Referer: `${requestOrigin}${request.nextUrl.pathname}`,
                'X-Requested-With': 'XMLHttpRequest',
            },
            cache: 'no-store',
        });

        if (!response.ok) {
            return null;
        }

        const payload = await response.json() as { data?: { role?: string } };
        return payload.data?.role === 'admin' ? '/admin' : '/dashboard';
    }
    catch {
        return null;
    }
}

/**
 * Server-side guard for the /admin panel in mock mode.
 *
 * Without this, the client-only `useEffect` redirect in admin pages runs only
 * AFTER the full React bundle, every admin React Query call, and the CSRF
 * cookie roundtrip have executed — none of which is gated by the role. A
 * non-admin who navigates to /admin/* would still trigger admin endpoint
 * calls (which the mock + backend reject, but the surface is wider than it
 * should be).
 *
 * In mock mode the role lives on the `mock_role` cookie. In production
 * (Laravel + Sanctum) the role isn't on the cookie — only a session id —
 * so this gate is a no-op there and we rely on the client `useEffect` +
 * backend `role:admin` middleware as defense in depth.
 */
function resolveAdminGateRedirect(request: NextRequest): URL | null {
    const pathname = normalizePathname(request.nextUrl.pathname);

    // Only gate /admin/*. /admin/login must remain reachable so the page can
    // surface the access-required toast.
    if (!pathname.startsWith('/admin') || pathname === '/admin/login') {
        return null;
    }

    const mockSession = request.cookies.get(MOCK_SESSION_COOKIE);
    const mockRole = request.cookies.get(MOCK_ROLE_COOKIE)?.value;
    const mockModeActive = mockSession !== undefined || mockRole !== undefined;

    if (!mockModeActive) {
        // Production mode — backend + client gate this; nothing to do here.
        return null;
    }

    if (!mockSession || mockRole !== 'admin') {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/admin/login';
        redirectUrl.search = '';
        return redirectUrl;
    }

    return null;
}

export async function proxy(request: NextRequest) {
    const host = request.headers.get('host');

    if (host === WWW_HOST) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.protocol = 'https';
        redirectUrl.host = CANONICAL_HOST;

        return NextResponse.redirect(redirectUrl, 308);
    }

    const adminGateRedirect = resolveAdminGateRedirect(request);
    if (adminGateRedirect !== null) {
        return NextResponse.redirect(adminGateRedirect, 307);
    }

    const pathname = normalizePathname(request.nextUrl.pathname);
    if (AUTHENTICATED_LOGIN_PATHS.has(pathname)) {
        const destination = await resolveAuthenticatedDestination(request);

        if (destination !== null) {
            const redirectUrl = request.nextUrl.clone();
            redirectUrl.pathname = destination;
            redirectUrl.search = '';

            return NextResponse.redirect(redirectUrl, 307);
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)',
    ],
};
