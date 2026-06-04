// Sentry Edge runtime init (Next.js middleware running on the Edge).
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
