import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isAuthCookieName, normalizeApiRootUrl, proxy } from './proxy';

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
});
