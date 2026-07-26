// Sentry browser SDK init.
//
// Loaded from `instrumentation-client.ts` (Next.js 16 convention). Strips
// PII / financial keys from event payloads so the monitoring service
// never accumulates a parallel patient-data store. Set
// `NEXT_PUBLIC_SENTRY_DSN` to enable; empty DSN = no-op.
import * as Sentry from '@sentry/nextjs';
import { sanitizeSentryUrl, scrubSentryPayload } from '@/lib/sentry-event-sanitizer';

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    // Default to OFF: PII collection is opt-in via NEXT_PUBLIC_SENTRY_SEND_PII=true.
    sendDefaultPii: process.env.NEXT_PUBLIC_SENTRY_SEND_PII === 'true',

    // Conservative sampling for cost control. Tracing OFF by default;
    // override via env when investigating perf.
    tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
        ? Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE)
        : 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,

    // Don't ship known-noise errors. Resize observer is benign; canceled
    // axios requests fire during route changes; ChunkLoad is usually a
    // CDN cache mismatch handled by the user reloading.
    ignoreErrors: [
        'ResizeObserver loop limit exceeded',
        'ResizeObserver loop completed with undelivered notifications',
        'Non-Error promise rejection captured',
        'AbortError',
        'CanceledError',
        'ChunkLoadError',
        'Loading chunk',
    ],

    beforeSend(event) {
        try {
            if (event.transaction) {
                event.transaction = sanitizeSentryUrl(event.transaction);
            }
            if (event.request) {
                event.request = scrubSentryPayload(event.request) as typeof event.request;
            }
            if (event.extra) {
                event.extra = scrubSentryPayload(event.extra) as typeof event.extra;
            }
            if (event.contexts) {
                event.contexts = scrubSentryPayload(event.contexts) as typeof event.contexts;
            }
            if (event.tags) {
                event.tags = scrubSentryPayload(event.tags) as typeof event.tags;
            }
        } catch {
            // Sanitizer must never break the event pipeline.
        }
        return event;
    },

    beforeBreadcrumb(breadcrumb) {
        // Drop XHR/fetch breadcrumbs for auth endpoints: they may carry
        // passwords, reset tokens, or Set-Cookie response headers.
        const url = breadcrumb.data?.url;
        if (typeof url === 'string' && (
            url.includes('/auth/login')
            || url.includes('/auth/change-password')
            || url.includes('/auth/reset-password')
            || url.includes('/auth/forgot-password')
        )) {
            return null;
        }
        if (breadcrumb.data) {
            breadcrumb.data = scrubSentryPayload(breadcrumb.data) as typeof breadcrumb.data;
        }
        return breadcrumb;
    },
});
