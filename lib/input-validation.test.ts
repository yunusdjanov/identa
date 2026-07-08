import { beforeEach, describe, expect, it } from 'vitest';

import { getTextValidationMessage, normalizePhoneForApi, setValidationLocale } from '@/lib/input-validation';

describe('getTextValidationMessage', () => {
    beforeEach(() => {
        setValidationLocale('en');
    });

    it('returns min-length validation error when provided text is too short', () => {
        const message = getTextValidationMessage('Al', {
            label: 'Name',
            required: true,
            min: 3,
            max: 255,
        });

        expect(message).toBe('Name must be at least 3 characters.');
    });

    it('does not return min-length error for optional empty values', () => {
        const message = getTextValidationMessage('', {
            label: 'Address',
            min: 3,
            max: 255,
        });

        expect(message).toBeNull();
    });
});

describe('normalizePhoneForApi', () => {
    it('returns empty string for blank input', () => {
        expect(normalizePhoneForApi('')).toBe('');
        expect(normalizePhoneForApi('   ')).toBe('');
    });

    it('prepends the Uzbek country code to a bare 9-digit local number', () => {
        // Mobile parity: a pasted local number must still reach the backend
        // fully qualified, not as a malformed "+901234567".
        expect(normalizePhoneForApi('901234567')).toBe('+998901234567');
        expect(normalizePhoneForApi('90 123 45 67')).toBe('+998901234567');
    });

    it('leaves an already-qualified number untouched', () => {
        expect(normalizePhoneForApi('+998901234567')).toBe('+998901234567');
        expect(normalizePhoneForApi('998901234567')).toBe('+998901234567');
    });

    it('does not infer a country code for partial input', () => {
        // 1–8 digits: the user may be mid-typing the +998 prefix.
        expect(normalizePhoneForApi('99')).toBe('+99');
        expect(normalizePhoneForApi('12345678')).toBe('+12345678');
    });

    it('keeps foreign numbers as typed', () => {
        // A full international number (not 9 digits) is passed through verbatim.
        expect(normalizePhoneForApi('+15550001234')).toBe('+15550001234');
    });
});
