import { describe, expect, it } from 'vitest';
import {
    isProtectedAppPath,
    resolvePostLoginDestination,
} from '@/lib/auth/post-login-destination';

describe('post-login destination', () => {
    it('accepts known protected paths and preserves their query string', () => {
        expect(resolvePostLoginDestination('/patients/42?tab=history', 'dentist'))
            .toBe('/patients/42?tab=history');
        expect(resolvePostLoginDestination('/analytics?period=month&currency=USD', 'assistant'))
            .toBe('/analytics?period=month&currency=USD');
    });

    it('rejects external, protocol-relative, public, and auth destinations', () => {
        expect(resolvePostLoginDestination('https://evil.example/patients/42', 'dentist'))
            .toBe('/dashboard');
        expect(resolvePostLoginDestination('//evil.example/patients/42', 'dentist'))
            .toBe('/dashboard');
        expect(resolvePostLoginDestination('/login?from=/patients', 'dentist'))
            .toBe('/dashboard');
        expect(resolvePostLoginDestination('/verify-email?status=success', 'dentist'))
            .toBe('/dashboard');
    });

    it('keeps admin sessions inside the admin portal', () => {
        expect(resolvePostLoginDestination('/patients/42', 'admin')).toBe('/admin');
        expect(resolvePostLoginDestination(null, 'admin')).toBe('/admin');
    });

    it('matches exact route prefixes without matching lookalike paths', () => {
        expect(isProtectedAppPath('/payments/patients/42')).toBe(true);
        expect(isProtectedAppPath('/payments-archive')).toBe(false);
    });
});
