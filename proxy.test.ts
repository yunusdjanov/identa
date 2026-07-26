import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isAuthCookieName, isCanonicalProductionHost, isMockApiEnabled, isMockApiPath, normalizeApiRootUrl, proxy } from './proxy';

describe('proxy auth redirects', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('normalizes API URLs that already include /api/v1', () => {
        vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.identa.uz/api/v1');

        expect(normalizeApiRootUrl()).toBe('https://api.identa.uz/api');
    });

    it('treats Laravel remember-me recaller cookies as auth cookies', () => {
        expect(isAuthCookieName('remember_web_1234567890abcdef')).toBe(true);
        expect(isAuthCookieName('identa_session')).toBe(true);
        expect(isAuthCookieName('XSRF-TOKEN')).toBe(false);
    });

    it('redirects remembered dentists away from the login page before rendering it', async () => {
        vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.identa.uz/api');
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ data: { role: 'dentist' } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        );

        const response = await proxy(new NextRequest('https://identa.uz/login', {
            headers: {
                cookie: 'remember_web_abc=recaller-cookie',
            },
        }));

        expect(fetchMock).toHaveBeenCalledWith(
            'https://api.identa.uz/api/v1/auth/me',
            expect.objectContaining({
                cache: 'no-store',
                headers: expect.objectContaining({
                    Cookie: 'remember_web_abc=recaller-cookie',
                    Origin: 'https://identa.uz',
                    Referer: 'https://identa.uz/login',
                    'X-Requested-With': 'XMLHttpRequest',
                }),
            })
        );
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('https://identa.uz/dashboard');
    });

    it('identifies mock backend paths without touching the real i18n route', () => {
        expect(isMockApiPath('/api/v1/auth/login')).toBe(true);
        expect(isMockApiPath('/api/v1')).toBe(true);
        expect(isMockApiPath('/api/v1/admin/dentists')).toBe(true);
        // The first-party locale route must stay reachable in every environment.
        expect(isMockApiPath('/api/i18n/ru')).toBe(false);
        expect(isMockApiPath('/dashboard')).toBe(false);
    });

    it('recognizes the canonical production host with or without a port', () => {
        expect(isCanonicalProductionHost('identa.uz')).toBe(true);
        expect(isCanonicalProductionHost('www.identa.uz')).toBe(true);
        expect(isCanonicalProductionHost('identa.uz:443')).toBe(true);
        expect(isCanonicalProductionHost('preview-identa.vercel.app')).toBe(false);
        expect(isCanonicalProductionHost(null)).toBe(false);
    });

    it('enables the mock API outside production and honours the explicit opt-in', () => {
        vi.stubEnv('NODE_ENV', 'development');
        expect(isMockApiEnabled()).toBe(true);

        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_API', '');
        expect(isMockApiEnabled()).toBe(false);

        vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_API', 'true');
        expect(isMockApiEnabled()).toBe(true);
    });

    it('returns 404 for mock /api/v1 routes in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_API', '');
        const fetchMock = vi.spyOn(globalThis, 'fetch');

        const response = await proxy(new NextRequest('https://identa.uz/api/v1/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
        }));

        expect(response.status).toBe(404);
        // The gate must short-circuit before any backend round-trip.
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still blocks mock /api/v1 routes on the live host when the mock opt-in is misconfigured', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_API', 'true');
        const fetchMock = vi.spyOn(globalThis, 'fetch');

        const response = await proxy(new NextRequest('https://identa.uz/api/v1/auth/login', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
        }));

        expect(response.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('allows explicit mock opt-in on non-live preview hosts', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_API', 'true');

        const response = await proxy(new NextRequest('https://preview-identa.vercel.app/api/v1/auth/me'));

        expect(response.status).toBe(200);
    });

    it('leaves the real i18n route reachable in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_API', '');

        const response = await proxy(new NextRequest('https://identa.uz/api/i18n/ru'));

        expect(response.status).toBe(200);
    });

    it('still serves mock /api/v1 routes outside production', async () => {
        vi.stubEnv('NODE_ENV', 'development');

        const response = await proxy(new NextRequest('https://identa.uz/api/v1/auth/me'));

        // Not a 404 from the gate — the request falls through to NextResponse.next().
        expect(response.status).toBe(200);
    });

    it('redirects remembered admins away from the admin login page before rendering it', async () => {
        vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.identa.uz/api');
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ data: { role: 'admin' } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        );

        const response = await proxy(new NextRequest('https://identa.uz/admin/login', {
            headers: {
                cookie: 'identa_session=session-cookie',
            },
        }));

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('https://identa.uz/admin');
    });

    it('preserves the protected pathname and query in the login return destination', async () => {
        vi.stubEnv('NODE_ENV', 'production');

        const response = await proxy(
            new NextRequest('https://identa.uz/patients/42?tab=history&currency=USD')
        );

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(
            'https://identa.uz/login?from=%2Fpatients%2F42%3Ftab%3Dhistory%26currency%3DUSD'
        );
    });

    it('keeps the email verification result page public for logged-out visitors', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        const fetchMock = vi.spyOn(globalThis, 'fetch');

        const response = await proxy(
            new NextRequest('https://identa.uz/verify-email?status=success')
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('location')).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
