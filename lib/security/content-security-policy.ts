interface StrictContentSecurityPolicyOptions {
    isProduction: boolean;
    nonce: string;
}

/**
 * Request-specific policy for authentication and application routes. Public
 * marketing pages keep the static policy from next.config so they remain CDN
 * cacheable; sensitive routes use this nonce policy instead.
 */
export function buildStrictContentSecurityPolicy({
    isProduction,
    nonce,
}: StrictContentSecurityPolicyOptions): string {
    const devConnectSrc = isProduction
        ? []
        : ['http://127.0.0.1:8001', 'http://localhost:8001', 'http://127.0.0.1:8100', 'http://localhost:8100'];
    const devImgSrc = isProduction ? [] : ['http://127.0.0.1:8001', 'http://localhost:8001'];
    const scriptHosts = ['https://va.vercel-scripts.com', 'https://accounts.google.com'];

    return [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "form-action 'self'",
        [
            "script-src 'self'",
            `'nonce-${nonce}'`,
            "'strict-dynamic'",
            ...(isProduction ? [] : ["'unsafe-eval'"]),
            ...scriptHosts,
        ].join(' '),
        [
            "script-src-elem 'self'",
            `'nonce-${nonce}'`,
            "'strict-dynamic'",
            ...scriptHosts,
        ].join(' '),
        // React components and Google Identity still use inline style
        // attributes. Nonces harden executable script without breaking those
        // non-executable presentation attributes.
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        ["img-src 'self' data: blob: https:", ...devImgSrc].join(' '),
        [
            "connect-src 'self' https://api.identa.uz",
            ...devConnectSrc,
            'https://*.r2.cloudflarestorage.com',
            'https://*.r2.dev',
            'https://vitals.vercel-insights.com',
            'https://*.vercel-insights.com',
            'https://accounts.google.com',
            'https://*.sentry.io',
        ].join(' '),
        "frame-src 'self' https://accounts.google.com",
        "media-src 'self' blob: data:",
        "worker-src 'self' blob:",
    ].join('; ');
}
