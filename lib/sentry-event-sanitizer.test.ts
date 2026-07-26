import { describe, expect, it } from 'vitest';
import {
    isSensitiveSentryKey,
    sanitizeSentryUrl,
    scrubSentryPayload,
} from '@/lib/sentry-event-sanitizer';

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

    it('removes query data and dynamic resource identifiers from URLs', () => {
        expect(sanitizeSentryUrl('https://identa.uz/patients/123?tab=history#entry'))
            .toBe('https://identa.uz/patients/[id]');
        expect(sanitizeSentryUrl('/payments/patients/456?currency=USD'))
            .toBe('/payments/patients/[id]');
        expect(sanitizeSentryUrl('/api/v1/patients/550e8400-e29b-41d4-a716-446655440000'))
            .toBe('/api/v1/patients/[id]');
        expect(sanitizeSentryUrl('/patients/pat-6')).toBe('/patients/[id]');
        expect(sanitizeSentryUrl('/patients/PT-4062TF')).toBe('/patients/[id]');
        expect(sanitizeSentryUrl('/forgot-password')).toBe('/forgot-password');
        expect(sanitizeSentryUrl('route transition')).toBe('route transition');
    });

    it('sanitizes URL-shaped breadcrumb fields and request query strings', () => {
        expect(scrubSentryPayload({
            from: '/patients/123?tab=history',
            to: '/payments/patients/456',
            label: 'navigation',
            query_string: 'patient=123',
        })).toEqual({
            from: '/patients/[id]',
            to: '/payments/patients/[id]',
            label: 'navigation',
            query_string: '[Filtered]',
        });
    });
});
