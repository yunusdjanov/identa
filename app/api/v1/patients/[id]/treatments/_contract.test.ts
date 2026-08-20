import { describe, expect, it } from 'vitest';
import {
    normalizeTreatmentPayload,
    parseTreatmentListQuery,
    scrubTreatmentFinancials,
    sortTreatments,
} from './_contract';

describe('mock treatment API contract', () => {
    it('normalizes text and keeps the primary tooth inside the normalized set', () => {
        const result = normalizeTreatmentPayload({
            treatment_type: '  Implant  ',
            treatment_date: '2026-01-05',
            description: '   ',
            comment: '  Follow up  ',
            teeth: [4],
            tooth_number: 3,
            currency: ' usd ',
        });

        expect(result.errors).toEqual({});
        expect(result.payload).toMatchObject({
            treatment_type: 'Implant',
            description: null,
            comment: 'Follow up',
            teeth: [3, 4],
            tooth_number: 3,
            currency: 'USD',
        });
    });

    it('rejects invalid dates, bounds, teeth, amounts, and currencies', () => {
        const result = normalizeTreatmentPayload({
            treatment_type: 'x',
            treatment_date: '2026-02-31',
            teeth: [33],
            debt_amount: -1,
            currency: 'EUR',
        });

        expect(result.errors).toEqual(expect.objectContaining({
            treatment_type: expect.any(Array),
            treatment_date: expect.any(Array),
            teeth: expect.any(Array),
            debt_amount: expect.any(Array),
            currency: expect.any(Array),
        }));
    });

    it('validates list controls and prevents cost-order leakage', () => {
        const invalid = parseTreatmentListQuery(
            new URL('https://example.test/treatments?per_page=501&include_images=maybe&sort=-cost'),
            false
        );
        expect(invalid.errors).toEqual(expect.objectContaining({
            per_page: expect.any(Array),
            include_images: expect.any(Array),
            sort: expect.any(Array),
        }));

        const allowed = parseTreatmentListQuery(
            new URL('https://example.test/treatments?per_page=2&include_images=0&sort=-treatment_date'),
            true
        );
        expect(allowed.errors).toEqual({});
        expect(allowed).toMatchObject({ perPage: 2, includeImages: false });
    });

    it('sorts deterministically and scrubs every financial field', () => {
        const items = sortTreatments([
            { id: '1', patient_id: 'p', treatment_type: 'A', treatment_date: '2026-01-01', cost: 5 },
            { id: '2', patient_id: 'p', treatment_type: 'B', treatment_date: '2026-01-02', cost: 10 },
        ], ['-treatment_date']);
        expect(items.map((item) => item.id)).toEqual(['2', '1']);
        expect(scrubTreatmentFinancials({ ...items[0], currency: 'USD', debt_amount: 10 }, false)).toMatchObject({
            cost: null,
            debt_amount: null,
            paid_amount: null,
            balance: null,
            currency: null,
        });
    });
});
