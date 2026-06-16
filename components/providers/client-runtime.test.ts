import { describe, expect, it } from 'vitest';
import { isStaleRuntimeError, shouldRecoverAuthEntryError } from '@/components/providers/client-runtime';

describe('ClientRuntime stale runtime recovery', () => {
    it('detects stale Next.js chunk loading failures', () => {
        expect(isStaleRuntimeError(new Error('ChunkLoadError: Loading chunk app/login/page failed.'))).toBe(true);
        expect(isStaleRuntimeError('Failed to fetch dynamically imported module')).toBe(true);
        expect(isStaleRuntimeError(new Error('Request failed with status 401'))).toBe(false);
    });

    it('recovers only auth entry pages from the Next.js fallback screen', () => {
        const fallbackCopy = "This page couldn't load\nReload to try again, or go back.";

        expect(shouldRecoverAuthEntryError('/login', fallbackCopy)).toBe(true);
        expect(shouldRecoverAuthEntryError('/register', fallbackCopy)).toBe(true);
        expect(shouldRecoverAuthEntryError('/patients', fallbackCopy)).toBe(false);
        expect(shouldRecoverAuthEntryError('/login', 'Sign in to Identa')).toBe(false);
    });
});
