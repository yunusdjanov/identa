import { beforeEach, describe, expect, it } from 'vitest';

import { getTextValidationMessage, setValidationLocale } from '@/lib/input-validation';

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
