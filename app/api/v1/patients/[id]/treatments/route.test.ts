import { afterEach, describe, expect, it, vi } from 'vitest';
import { canViewFinancials } from '../../../_auth';
import { mockTreatmentStore } from './_contract';
import { GET as LIST, POST } from './route';
import { DELETE, GET as DETAIL, PUT } from './[treatmentId]/route';

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({
        get: (name: string) => ({
            mock_role: 'dentist',
            mock_user_id: 'dentist-1',
        }[name] ? { value: { mock_role: 'dentist', mock_user_id: 'dentist-1' }[name] } : undefined),
    })),
}));

vi.mock('../../../_auth', () => ({
    canViewFinancials: vi.fn(async () => true),
    hasMockPermission: vi.fn(async () => true),
    requirePracticePermission: vi.fn(async () => null),
}));

describe('treatment mock routes', () => {
    const createdIds: string[] = [];

    afterEach(() => {
        vi.mocked(canViewFinancials).mockResolvedValue(true);
        for (const id of createdIds.splice(0)) {
            const index = mockTreatmentStore.findIndex((treatment) => treatment.id === id);
            if (index >= 0) mockTreatmentStore.splice(index, 1);
        }
    });

    it('validates list controls instead of silently coercing them', async () => {
        const response = await LIST(
            new Request('http://localhost/api/v1/patients/pat-1/treatments?per_page=501&sort=-unknown'),
            { params: Promise.resolve({ id: 'pat-1' }) }
        );

        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({
            errors: { per_page: expect.any(Array), sort: expect.any(Array) },
        });
    });

    it('persists create/update/delete and preserves omitted optional fields', async () => {
        const createResponse = await POST(new Request('http://localhost/api/v1/patients/pat-1/treatments', {
            method: 'POST',
            body: JSON.stringify({
                treatment_type: '  Implant  ',
                treatment_date: '2026-02-14',
                comment: 'Keep this note',
                debt_amount: 100,
                paid_amount: 150,
                currency: 'usd',
            }),
        }), { params: Promise.resolve({ id: 'pat-1' }) });
        expect(createResponse.status).toBe(201);
        const created = await createResponse.json() as { data: { id: string; balance: number } };
        createdIds.push(created.data.id);
        expect(created.data.balance).toBe(-50);

        const updateResponse = await PUT(new Request('http://localhost/treatment', {
            method: 'PUT',
            body: JSON.stringify({ treatment_type: 'Reviewed implant', treatment_date: '2026-02-15' }),
        }), { params: Promise.resolve({ id: 'pat-1', treatmentId: created.data.id }) });
        expect(updateResponse.status).toBe(200);
        expect(await updateResponse.json()).toMatchObject({
            data: { treatment_type: 'Reviewed implant', comment: 'Keep this note' },
        });

        const detailResponse = await DETAIL(new Request('http://localhost/treatment'), {
            params: Promise.resolve({ id: 'pat-1', treatmentId: created.data.id }),
        });
        expect(detailResponse.status).toBe(200);

        const deleteResponse = await DELETE(new Request('http://localhost/treatment', { method: 'DELETE' }), {
            params: Promise.resolve({ id: 'pat-1', treatmentId: created.data.id }),
        });
        expect(deleteResponse.status).toBe(204);
        createdIds.splice(createdIds.indexOf(created.data.id), 1);
        expect(mockTreatmentStore.some((treatment) => treatment.id === created.data.id)).toBe(false);
    });

    it('returns 404 for an unknown entry and scrubs currency with other money fields', async () => {
        const missing = await DETAIL(new Request('http://localhost/treatment'), {
            params: Promise.resolve({ id: 'pat-1', treatmentId: 'missing' }),
        });
        expect(missing.status).toBe(404);

        vi.mocked(canViewFinancials).mockResolvedValue(false);
        const existing = mockTreatmentStore.find((treatment) => treatment.patient_id === 'pat-1');
        expect(existing).toBeDefined();
        const response = await DETAIL(new Request('http://localhost/treatment'), {
            params: Promise.resolve({ id: 'pat-1', treatmentId: existing!.id }),
        });
        expect(await response.json()).toMatchObject({
            data: { cost: null, debt_amount: null, paid_amount: null, balance: null, currency: null },
        });
    });
});
