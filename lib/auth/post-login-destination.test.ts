import { describe, expect, it } from 'vitest';
import {
    isProtectedAppPath,
    resolvePostLoginDestination,
} from '@/lib/auth/post-login-destination';

describe('post-login destination', () => {
    const assistant = (permissions: string[]) => ({
        role: 'assistant' as const,
        account_status: 'active' as const,
        assistant_permissions: permissions,
    });

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

    it('sends assistants to their first accessible module', () => {
        expect(resolvePostLoginDestination(null, assistant(['appointments.view'])))
            .toBe('/dashboard');
        expect(resolvePostLoginDestination(null, assistant(['patients.view'])))
            .toBe('/patients');
        expect(resolvePostLoginDestination(null, assistant(['payments.view'])))
            .toBe('/payments');
        expect(resolvePostLoginDestination(null, assistant([])))
            .toBe('/settings');
    });

    it('does not honor a from path outside the assistant permissions', () => {
        expect(resolvePostLoginDestination('/dashboard', assistant(['patients.view'])))
            .toBe('/patients');
        expect(resolvePostLoginDestination('/billing', assistant(['payments.view'])))
            .toBe('/payments');
        expect(resolvePostLoginDestination('/patients/42?tab=history', assistant(['patients.view'])))
            .toBe('/patients/42?tab=history');
    });
});
