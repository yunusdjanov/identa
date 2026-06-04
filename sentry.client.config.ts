// Sentry browser SDK init.
//
// Loaded from `instrumentation-client.ts` (Next.js 16 convention). Strips
// PII / financial keys from event payloads so the monitoring service
// never accumulates a parallel patient-data store — mirrors the backend
// `SentryEventSanitizer` key list. Set `NEXT_PUBLIC_SENTRY_DSN` to
// enable; empty DSN = no-op (good for dev / preview branches).
import * as Sentry from '@sentry/nextjs';

// Kept in sync with backend `App\Support\SentryEventSanitizer::SENSITIVE_KEYS`
// — any change here should land in both files. `user_agent` is deliberately
// not scrubbed (debugging browser-specific bugs needs it).
const SENSITIVE_KEYS = [
    // Credentials
    'password',
    'password_confirmation',
    'pass',
    'passwd',
    'pwd',
    'token',
    'access_token',
    'refresh_token',
    'id_token',
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'api_key',
    'apikey',
    'secret',
    'client_secret',
    'x-csrf-token',
    'x-xsrf-token',
    'csrf_token',
    '_token',
    // PII (matches backend list)
    'phone',
    'secondary_phone',
    'patient_phone',
    'date_of_birth',
    'medical_history',
    'allergies',
    'current_medications',
    'iin',
    'email',
    'full_name',
    'name',
    'notes',
    'note',
    'address',
    'practice_name',
    'license_number',
    'patient_id',
    'ip_address',
    'ip',
    'provider',
    'provider_payment_id',
    'provider_order_id',
    'provider_payload',
    'transaction_id',
    'payment_method',
    // Financials (matches AuditLogResource)
    'amount',
    'cost',
    'debt_amount',
    'paid_amount',
    'total_amount',
    'balance',
    'refund_amount',
    'payment_amount',
    'unit_price',
    'total_price',
] as const;

// Suffix-aware match: a key counts as sensitive if it equals a listed key
// OR ends with `_<key>` / `.<key>`. Mirrors backend semantics so
// nested fields like `patient.phone`, `request.body.payment_method`, or
// `final_amount` all get redacted. Exact-match alone (`set.has(key)`) was
// the original bug — `patient_phone_number` slipped through.
function isSensitiveKey(key: string): boolean {
    const normalized = key.toLowerCase();
    for (const sensitive of SENSITIVE_KEYS) {
        if (normalized === sensitive) return true;
        if (normalized.endsWith('_' + sensitive)) return true;
        if (normalized.endsWith('.' + sensitive)) return true;
    }
    return false;
}

function scrub(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(scrub);
    if (typeof value !== 'object') return value;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (isSensitiveKey(key)) {
            out[key] = '[Filtered]';
            continue;
        }
        out[key] = scrub(child);
    }
    return out;
}

Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,

    // Default to OFF — PII collection is opt-in via NEXT_PUBLIC_SENTRY_SEND_PII=true.
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
            if (event.request) {
                event.request = scrub(event.request) as typeof event.request;
            }
            if (event.extra) {
                event.extra = scrub(event.extra) as typeof event.extra;
            }
            if (event.contexts) {
                event.contexts = scrub(event.contexts) as typeof event.contexts;
            }
            if (event.tags) {
                event.tags = scrub(event.tags) as typeof event.tags;
            }
        } catch {
            // Sanitizer must never break the event pipeline.
        }
        return event;
    },

    beforeBreadcrumb(breadcrumb) {
        // Drop XHR/fetch breadcrumbs for auth endpoints — they carry the
        // request body (including passwords on /login) and the response
        // headers (including Set-Cookie on a successful login).
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
            breadcrumb.data = scrub(breadcrumb.data) as typeof breadcrumb.data;
        }
        return breadcrumb;
    },
});
