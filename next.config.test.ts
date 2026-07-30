import { describe, expect, it } from 'vitest';
import nextConfig from './next.config';

describe('next security headers', () => {
    it('allows browser direct uploads to Cloudflare R2 signed URLs', async () => {
        const headers = await nextConfig.headers?.();
        const csp = headers
            ?.flatMap((entry) => entry.headers)
            .find((header) => header.key === 'Content-Security-Policy')
            ?.value;

        expect(csp).toContain('connect-src');
        expect(csp).toContain('https://*.r2.cloudflarestorage.com');
        expect(csp).toContain('https://*.r2.dev');
    });

    it('prevents every private application surface from being indexed', async () => {
        const headers = await nextConfig.headers?.();
        const noIndexRule = headers?.find((entry) =>
            entry.headers.some((header) => header.key === 'X-Robots-Tag')
        );

        expect(noIndexRule?.source).toContain('analytics');
        expect(noIndexRule?.source).toContain('verify-email');
        expect(noIndexRule?.headers).toContainEqual({
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive',
        });
    });
});
