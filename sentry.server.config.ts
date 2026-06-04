// Sentry Node runtime init (Next.js 16 server actions, route handlers,
// SSR). The backend Laravel app already has its own Sentry config — this
// covers the Next.js Node layer (mock API routes, middleware errors).
import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,

    sendDefaultPii: false,
    tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE
        ? Number(process.env.SENTRY_TRACES_SAMPLE_RATE)
        : 0,
});
