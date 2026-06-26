import { describe, expect, it } from 'vitest';
import { isSensitiveSentryKey, scrubSentryPayload } from '@/lib/sentry-event-sanitizer';

describe('sentry event sanitizer', () => {
    it('redacts exact and suffix sensitive keys', () => {
        expect(isSensitiveSentryKey('patient.phone')).toBe(true);
        expect(isSensitiveSentryKey('final_amount')).toBe(true);
        expect(isSensitiveSentryKey('user_agent')).toBe(false);

        expect(scrubSentryPayload({
            request: {
                patient: { phone: '+998901234567' },
                final_amount: 1000,
                safe: 'ok',
            },
        })).toEqual({
            request: {
                patient: { phone: '[Filtered]' },
                final_amount: '[Filtered]',
                safe: 'ok',
            },
        });
    });

    it('handles circular payloads without overflowing the stack', () => {
        const payload: Record<string, unknown> = { safe: 'ok' };
        payload.self = payload;

        expect(scrubSentryPayload(payload)).toEqual({ safe: 'ok', self: '[Circular]' });
    });

    it('truncates overly deep payloads', () => {
        let payload: Record<string, unknown> = { leaf: 'value' };
        for (let depth = 0; depth < 12; depth += 1) {
            payload = { child: payload };
        }

        expect(JSON.stringify(scrubSentryPayload(payload))).toContain('[Truncated]');
    });

    it('contains unserializable proxy payloads', () => {
        const proxy = new Proxy({}, {
            ownKeys() {
                throw new Error('boom');
            },
        });

        expect(scrubSentryPayload(proxy)).toBe('[Unserializable]');
    });
});
