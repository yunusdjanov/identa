const MAX_SENTRY_SCRUB_DEPTH = 8;
const FILTERED_VALUE = '[Filtered]';
const CIRCULAR_VALUE = '[Circular]';
const TRUNCATED_VALUE = '[Truncated]';
const UNSERIALIZABLE_VALUE = '[Unserializable]';

// Kept in sync with backend `App\Support\SentryEventSanitizer::SENSITIVE_KEYS`.
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
] as const;

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
            out[key] = isSensitiveSentryKey(key)
                ? FILTERED_VALUE
                : scrubSentryPayload(child, activePath, depth + 1);
        }

        return out;
    } catch {
        return UNSERIALIZABLE_VALUE;
    } finally {
        activePath.delete(objectValue);
    }
}
