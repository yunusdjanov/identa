import { describe, expect, it } from 'vitest';
import { normalizePatientPayload } from './_contract';

describe('mock patient API contract', () => {
    it('normalizes identity text and blank optional fields like the backend request', () => {
        const result = normalizePatientPayload({
            full_name: '  Test Patient  ',
            phone: '  +998901234567  ',
            secondary_phone: '   ',
            address: '  Tashkent  ',
        });

        expect(result.errors).toEqual({});
        expect(result.payload).toMatchObject({
            full_name: 'Test Patient',
            phone: '+998901234567',
            secondary_phone: null,
            address: 'Tashkent',
        });
    });

    it('rejects the backend-invalid identity and bounded text cases', () => {
        const result = normalizePatientPayload({
            full_name: 'x',
            phone: '90 123 45 67',
            gender: 'other',
            date_of_birth: '2999-01-01',
            allergies: 'a'.repeat(41),
        });

        expect(result.errors).toEqual(expect.objectContaining({
            full_name: expect.any(Array),
            phone: expect.any(Array),
            gender: expect.any(Array),
            date_of_birth: expect.any(Array),
            allergies: expect.any(Array),
        }));
    });

    it('preserves omitted optional fields for PUT while allowing explicit clearing', () => {
        const preserved = normalizePatientPayload({
            full_name: 'Updated Patient',
            phone: '+998901234567',
        }, { preserveMissingOptionalFields: true });
        expect(preserved.payload).not.toHaveProperty('address');
        expect(preserved.payload).not.toHaveProperty('categories');

        const cleared = normalizePatientPayload({
            full_name: 'Updated Patient',
            phone: '+998901234567',
            address: '   ',
            category_id: null,
        }, { preserveMissingOptionalFields: true });
        expect(cleared.payload).toMatchObject({ address: null, categories: [] });
    });
});
