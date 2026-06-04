// Next.js instrumentation hook — wires Sentry Node/Edge runtime init.
// Empty DSN env makes Sentry a no-op so this file is safe to ship in
// dev/preview even without monitoring configured.
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('./sentry.server.config');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('./sentry.edge.config');
    }
}

// Re-export the Sentry-captured request error so Next.js routes through.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
