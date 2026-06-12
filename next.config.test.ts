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
});
