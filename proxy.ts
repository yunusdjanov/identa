import { NextRequest, NextResponse } from 'next/server';

const CANONICAL_HOST = 'identa.uz';
const WWW_HOST = 'www.identa.uz';
const AUTHENTICATED_LOGIN_PATHS = new Set(['/login', '/admin/login']);
const SESSION_COOKIE_NAMES = ['identa-session', 'identa_session', 'laravel-session', 'laravel_session'];

function normalizeApiRootUrl(): string {
    const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8001/api';
    const normalizedApiUrl = configuredApiUrl.replace(/\/+$/, '');

    return normalizedApiUrl.endsWith('/api') ? normalizedApiUrl : `${normalizedApiUrl}/api`;
}

function hasSessionCookie(request: NextRequest): boolean {
    return SESSION_COOKIE_NAMES.some((cookieName) => Boolean(request.cookies.get(cookieName)?.value));
}

function normalizePathname(pathname: string): string {
    if (pathname !== '/' && pathname.endsWith('/')) {
        return pathname.slice(0, -1);
    }

    return pathname;
}

async function resolveAuthenticatedDestination(request: NextRequest): Promise<string | null> {
    if (!hasSessionCookie(request)) {
        return null;
    }

    try {
        const response = await fetch(`${normalizeApiRootUrl()}/v1/auth/me`, {
            headers: {
                Accept: 'application/json',
                Cookie: request.headers.get('cookie') ?? '',
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
