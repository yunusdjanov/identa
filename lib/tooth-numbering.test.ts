import { describe, expect, it } from 'vitest';
import { formatToothList, formatToothNumber, toFdiToothNumber } from '@/lib/tooth-numbering';

describe('tooth numbering', () => {
    it('maps internal adult tooth numbers to FDI display labels', () => {
        expect(toFdiToothNumber(1)).toBe(11);
        expect(toFdiToothNumber(8)).toBe(18);
        expect(toFdiToothNumber(9)).toBe(21);
        expect(toFdiToothNumber(16)).toBe(28);
        expect(toFdiToothNumber(17)).toBe(31);
        expect(toFdiToothNumber(24)).toBe(38);
        expect(toFdiToothNumber(25)).toBe(41);
        expect(toFdiToothNumber(32)).toBe(48);
    });

    it('formats tooth labels without changing stored values', () => {
        expect(formatToothNumber(12)).toBe('24');
        expect(formatToothList([8, 9, 32])).toBe('18, 21, 48');
        expect(formatToothList([])).toBe('-');
    });
});
