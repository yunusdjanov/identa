import { describe, it, expect } from 'vitest';
import {
    formatCurrency,
    extractPrimaryPhone,
    sanitizeTimeInput,
    isValidTimeInput,
    toLocalDateKey,
    getDaysSinceLastVisit,
    getToothConditionColor,
    getStatusBadgeColor,
    truncateForUi,
    cn,
} from '@/lib/utils';

describe('formatCurrency', () => {
    it('appends the UZS suffix by default', () => {
        const result = formatCurrency(1500);
        expect(result.endsWith(' UZS')).toBe(true);
        // Strip group separators (uz-UZ uses spaces) and the suffix.
        expect(result.replace(/[^\d]/g, '')).toBe('1500');
    });

    it('uppercases and uses the provided currency', () => {
        expect(formatCurrency(100, 'usd').endsWith(' USD')).toBe(true);
    });

    it('renders 0 for non-finite amounts instead of NaN/Infinity', () => {
        expect(formatCurrency(Number.NaN)).toBe('0 UZS');
        expect(formatCurrency(Number.POSITIVE_INFINITY)).toBe('0 UZS');
        expect(formatCurrency(0)).toBe('0 UZS');
    });
});

describe('extractPrimaryPhone', () => {
    it('returns an empty string for nullish/blank input', () => {
        expect(extractPrimaryPhone(null)).toBe('');
        expect(extractPrimaryPhone(undefined)).toBe('');
        expect(extractPrimaryPhone('   ')).toBe('');
    });

    it('returns the first phone when several are separated', () => {
        expect(extractPrimaryPhone('+998 90 123 45 67 | +998 91 234 56 78')).toBe('+998 90 123 45 67');
        expect(extractPrimaryPhone('+998901234567, +998917654321')).toBe('+998901234567');
        expect(extractPrimaryPhone('a / b')).toBe('a');
    });

    it('returns a single phone trimmed', () => {
        expect(extractPrimaryPhone('  +998 90 123 45 67  ')).toBe('+998 90 123 45 67');
    });
});

describe('sanitizeTimeInput', () => {
    it('keeps only digits and colon, capped at 5 chars', () => {
        expect(sanitizeTimeInput('a9:30xx')).toBe('9:30');
        expect(sanitizeTimeInput('123456')).toBe('12345');
        expect(sanitizeTimeInput('09:30')).toBe('09:30');
    });
});

describe('isValidTimeInput', () => {
    it('accepts valid HH:MM', () => {
        expect(isValidTimeInput('09:30')).toBe(true);
        expect(isValidTimeInput('00:00')).toBe(true);
        expect(isValidTimeInput('23:59')).toBe(true);
    });

    it('rejects malformed or out-of-range values', () => {
        expect(isValidTimeInput('9:30')).toBe(false);
        expect(isValidTimeInput('24:00')).toBe(false);
        expect(isValidTimeInput('12:60')).toBe(false);
        expect(isValidTimeInput('')).toBe(false);
        expect(isValidTimeInput(undefined)).toBe(false);
    });
});

describe('toLocalDateKey', () => {
    it('formats a date as YYYY-MM-DD in local time', () => {
        // Month is 0-indexed: 5 === June.
        expect(toLocalDateKey(new Date(2026, 5, 4))).toBe('2026-06-04');
        expect(toLocalDateKey(new Date(2026, 0, 9))).toBe('2026-01-09');
    });
});

describe('getDaysSinceLastVisit', () => {
    it('returns Infinity when no date is provided', () => {
        expect(getDaysSinceLastVisit()).toBe(Infinity);
        expect(getDaysSinceLastVisit(undefined)).toBe(Infinity);
    });

    it('returns a positive day count for a past date', () => {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const days = getDaysSinceLastVisit(threeDaysAgo);
        expect(days).toBeGreaterThanOrEqual(3);
        expect(days).toBeLessThanOrEqual(4);
    });
});

describe('getToothConditionColor', () => {
    it('maps known conditions and falls back to healthy', () => {
        expect(getToothConditionColor('cavity')).toContain('red');
        expect(getToothConditionColor('implant')).toContain('green');
        expect(getToothConditionColor('unknown-condition')).toBe(getToothConditionColor('healthy'));
    });
});

describe('getStatusBadgeColor', () => {
    it('maps known statuses and falls back to slate', () => {
        expect(getStatusBadgeColor('completed')).toContain('green');
        expect(getStatusBadgeColor('unpaid')).toContain('red');
        expect(getStatusBadgeColor('mystery')).toBe('bg-slate-100 text-slate-800');
    });
});

describe('truncateForUi', () => {
    it('returns the value unchanged when within the limit', () => {
        expect(truncateForUi('hello', 10)).toBe('hello');
        expect(truncateForUi('hello', 5)).toBe('hello');
    });

    it('truncates with an ellipsis when over the limit', () => {
        expect(truncateForUi('hello world', 5)).toBe('hell…');
    });

    it('handles the degenerate limits', () => {
        expect(truncateForUi('hello', 0)).toBe('');
        expect(truncateForUi('hello', 1)).toBe('…');
    });
});

describe('cn', () => {
    it('merges conflicting tailwind classes, last wins', () => {
        expect(cn('p-2', 'p-4')).toBe('p-4');
        expect(cn('text-sm', false && 'hidden', 'font-bold')).toBe('text-sm font-bold');
    });
});
