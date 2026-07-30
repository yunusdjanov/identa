// Keep the browser SDK out of the baseline bundle when client monitoring is
// intentionally disabled. NEXT_PUBLIC_* values are replaced at build time, so
// production deployments with a DSN still receive the normal Sentry chunk.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    void import('./sentry.client.config');
}
