import { NextRequest, NextResponse } from 'next/server';
import { isProtectedAppPath } from '@/lib/auth/post-login-destination';

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

/**
 * The in-app mock API (`/api/v1/*`) substitutes for the Laravel backend during
 * local development and tests. It must NEVER be served in production: the mock
 * login (`/api/v1/auth/login`) accepts ANY password and can mint an
 * `mock_role=admin` cookie, so a deployed mock surface is a critical auth
 * bypass. In production the browser talks to the real backend via
 * `NEXT_PUBLIC_API_URL`, so these routes are dead weight there anyway.
 *
 * `/api/i18n/*` is a genuine first-party route (it serves locale dictionaries
 * from this origin in every environment) and is intentionally NOT gated.
 */
export function isMockApiEnabled(): boolean {
    return process.env.NODE_ENV !== 'production'
        || process.env.NEXT_PUBLIC_ENABLE_MOCK_API === 'true';
}

export function isMockApiPath(pathname: string): boolean {
    return pathname === '/api/v1' || pathname.startsWith('/api/v1/');
}

export function isCanonicalProductionHost(host: string | null): boolean {
    const normalizedHost = host?.split(':', 1)[0]?.toLowerCase();

    return normalizedHost === CANONICAL_HOST || normalizedHost === WWW_HOST;
}

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
    if (request.cookies.getAll().some((cookie) => isAuthCookieName(cookie.name) && Boolean(cookie.value))) {
        return true;
    }
    // Mock mode (local dev / preview / tests): the in-app mock login sets
    // `mock_session` instead of a real Sanctum cookie, so the dentist/assistant
    // protected-route gate must accept it too — otherwise a logged-in mock
    // session bounces straight back to /login and the app is unreachable.
    // Recognised ONLY when the mock API is actually enabled: in production
    // `isMockApiEnabled()` is false, so a forged `mock_session` can never slip
    // past the gate there — the real Sanctum cookie stays the only credential.
    return isMockApiEnabled() && Boolean(request.cookies.get(MOCK_SESSION_COOKIE)?.value);
}

function normalizePathname(pathname: string): string {
    if (pathname !== '/' && pathname.endsWith('/')) {
        return pathname.slice(0, -1);
    }

    return pathname;
}

/**
 * Server-side bounce for visitors who hit a protected route with no Sanctum
 * cookie. Without this gate, Next streams the dashboard HTML + the AppLayout
 * skeleton, then the client-only `useEffect` waits for `auth/me` to 401
 * before redirecting — a visible "logged in for a beat" flash that also
 * leaks the layout shell to scrapers / bots that don't execute JS.
 *
 * The check is intentionally just "is the cookie present at all?", NOT "is
 * the cookie still valid?". Validating the cookie would require a network
 * round-trip to `/auth/me` from Edge on every protected request (slow, costly,
 * and exposes the cookie to a fetch chain). The "cookie present but revoked"
 * case is already handled by the existing client redirect on 401 — this gate
 * just removes the "no cookie at all → still saw the skeleton" hole.
 */
function resolveProtectedRouteRedirect(request: NextRequest): URL | null {
    const pathname = normalizePathname(request.nextUrl.pathname);
    if (!isProtectedAppPath(pathname)) {
        return null;
    }
    if (hasAuthCookie(request)) {
        return null;
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/login';
    // Surface the original destination so /login can bounce the user back
    // after a successful sign-in (handled client-side by reading ?from=).
    redirectUrl.search = '';
    redirectUrl.searchParams.set('from', `${pathname}${request.nextUrl.search}`);
    return redirectUrl;
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
    const host = request.headers.get('host') ?? request.nextUrl.host;

    if (host === WWW_HOST) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.protocol = 'https';
        redirectUrl.host = CANONICAL_HOST;

        return NextResponse.redirect(redirectUrl, 308);
    }

    // Hard-block the development-only mock backend on the live host even if a
    // bad env override is deployed. Preview builds can still opt in via
    // NEXT_PUBLIC_ENABLE_MOCK_API=true, but identa.uz itself never serves
    // password-less fixture endpoints.
    const liveProductionHost = process.env.NODE_ENV === 'production' && isCanonicalProductionHost(host);
    if (isMockApiPath(request.nextUrl.pathname)
        && (!isMockApiEnabled() || liveProductionHost)) {
        return new NextResponse(null, { status: 404 });
    }

    const adminGateRedirect = resolveAdminGateRedirect(request);
    if (adminGateRedirect !== null) {
        return NextResponse.redirect(adminGateRedirect, 307);
    }

    // Dentist / assistant protected-route gate. Runs after the admin gate so
    // /admin/* can be handled by its own role-aware logic, but before the
    // /login authenticated-bounce so a logged-out visit to /dashboard ends
    // at /login *without* the /login proxy then trying to bounce back.
    const protectedRouteRedirect = resolveProtectedRouteRedirect(request);
    if (protectedRouteRedirect !== null) {
        return NextResponse.redirect(protectedRouteRedirect, 307);
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
