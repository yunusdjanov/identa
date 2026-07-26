const MAX_SENTRY_SCRUB_DEPTH = 8;
const FILTERED_VALUE = '[Filtered]';
const CIRCULAR_VALUE = '[Circular]';
const TRUNCATED_VALUE = '[Truncated]';
const UNSERIALIZABLE_VALUE = '[Unserializable]';
const URL_BASE = 'https://identa.invalid';
const URL_VALUE_KEYS = new Set(['url', 'href', 'from', 'to', 'referer', 'referrer']);
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ULID_SEGMENT = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;
const PREFIXED_ID_SEGMENT = /^[a-z][a-z0-9]*-\d+$/i;
const OPAQUE_CODE_SEGMENT = /^[a-z]{2,}-(?=[a-z0-9]*\d)[a-z0-9]{4,}$/i;

// Core business fields mirror backend `App\Support\SentryEventSanitizer`.
// Browser-only query metadata is included here as an additional boundary.
// `user_agent` is deliberately not scrubbed: browser-specific debugging needs it.
const SENSITIVE_KEYS = [
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
    'query_string',
    'querystring',
] as const;

function isDynamicPathSegment(segment: string): boolean {
    return /^\d+$/.test(segment)
        || UUID_SEGMENT.test(segment)
        || ULID_SEGMENT.test(segment)
        || LONG_HEX_SEGMENT.test(segment)
        || PREFIXED_ID_SEGMENT.test(segment)
        || OPAQUE_CODE_SEGMENT.test(segment);
}

/**
 * Removes query/fragment data and opaque resource identifiers from URL-shaped
 * values before they leave the browser. Static route names remain useful for
 * grouping errors while patient/resource identities are not retained.
 */
export function sanitizeSentryUrl(value: string): string {
    if (!value.startsWith('/') && !/^https?:\/\//i.test(value)) {
        return value;
    }

    try {
        const isAbsolute = /^https?:\/\//i.test(value);
        const parsed = new URL(value, URL_BASE);
        const pathname = parsed.pathname
            .split('/')
            .map((segment) => {
                if (!segment) return segment;

                try {
                    return isDynamicPathSegment(decodeURIComponent(segment)) ? '[id]' : segment;
                } catch {
                    return segment;
                }
            })
            .join('/');

        return isAbsolute ? `${parsed.origin}${pathname}` : pathname;
    } catch {
        return value;
    }
}

/**
 * Checks Sentry payload keys using the same suffix-aware convention as backend sanitization.
 */
export function isSensitiveSentryKey(key: string): boolean {
    const normalized = key.toLowerCase();

    for (const sensitive of SENSITIVE_KEYS) {
        if (normalized === sensitive) return true;
        if (normalized.endsWith('_' + sensitive)) return true;
        if (normalized.endsWith('.' + sensitive)) return true;
    }

    return false;
}

/**
 * Returns a Sentry-safe clone with sensitive values redacted and recursive/proxy-shaped input contained.
 */
export function scrubSentryPayload(value: unknown, activePath = new WeakSet<object>(), depth = 0): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value !== 'object') return value;
    if (depth > MAX_SENTRY_SCRUB_DEPTH) return TRUNCATED_VALUE;

    const objectValue = value as object;
    if (activePath.has(objectValue)) return CIRCULAR_VALUE;

    activePath.add(objectValue);

    try {
        if (Array.isArray(value)) {
            return value.map((child) => scrubSentryPayload(child, activePath, depth + 1));
        }

        const out: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            if (isSensitiveSentryKey(key)) {
                out[key] = FILTERED_VALUE;
                continue;
            }

            out[key] = typeof child === 'string' && URL_VALUE_KEYS.has(key.toLowerCase())
                ? sanitizeSentryUrl(child)
                : scrubSentryPayload(child, activePath, depth + 1);
        }

        return out;
    } catch {
        return UNSERIALIZABLE_VALUE;
    } finally {
        activePath.delete(objectValue);
    }
}
