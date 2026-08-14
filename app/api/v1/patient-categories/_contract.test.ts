import { afterEach, describe, expect, it } from 'vitest';
import { normalizePatientCategoryPayload, patientCategoryStore } from './_contract';

const originalCategories = patientCategoryStore().map((category) => ({ ...category }));

afterEach(() => {
    patientCategoryStore().splice(0, patientCategoryStore().length, ...originalCategories.map((category) => ({ ...category })));
});

describe('mock patient-category API contract', () => {
    it('trims before duplicate validation and applies backend defaults', () => {
        const duplicate = normalizePatientCategoryPayload({ name: `  ${originalCategories[0].name}  ` });
        expect(duplicate.errors.name).toBeDefined();

        const valid = normalizePatientCategoryPayload({ name: '  Priority  ' });
        expect(valid.errors).toEqual({});
        expect(valid.payload).toEqual({ name: 'Priority', color: '#CBD5E1', sort_order: 0 });
    });

    it('rejects malformed color and sort order', () => {
        const result = normalizePatientCategoryPayload({
            name: 'Priority',
            color: 'red',
            sort_order: 1000,
        });

        expect(result.errors.color).toBeDefined();
        expect(result.errors.sort_order).toBeDefined();
    });
});
