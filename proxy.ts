import { NextRequest, NextResponse } from 'next/server';

const CANONICAL_HOST = 'identa.uz';
const WWW_HOST = 'www.identa.uz';
const AUTHENTICATED_LOGIN_PATHS = new Set(['/login', '/admin/login']);
const SESSION_COOKIE_NAMES = ['identa-session', 'identa_session', 'laravel-session', 'laravel_session'];
const LARAVEL_REMEMBER_COOKIE_PREFIX = 'remember_web_';

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

export async function proxy(request: NextRequest) {
    const host = request.headers.get('host');

    if (host === WWW_HOST) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.protocol = 'https';
        redirectUrl.host = CANONICAL_HOST;

        return NextResponse.redirect(redirectUrl, 308);
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
