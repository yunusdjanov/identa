import { afterEach, describe, expect, it, vi } from 'vitest';
import { PAYMENT_EXPENSES } from '../../_mock-data';
import { PUT } from './[id]/route';
import { GET, POST } from './route';

vi.mock('../../_auth', () => ({
    forbidden: vi.fn(),
    hasMockPermission: vi.fn(async () => true),
    requireAuth: vi.fn(async () => null),
}));

describe('payment expense mock routes', () => {
    const createdIds: string[] = [];

    afterEach(() => {
        for (const id of createdIds.splice(0)) {
            const index = PAYMENT_EXPENSES.findIndex((expense) => expense.id === id);
            if (index >= 0) PAYMENT_EXPENSES.splice(index, 1);
        }
    });

    it('normalizes valid create input and rejects whitespace-only titles', async () => {
        const invalid = await POST(new Request('http://localhost/api/v1/payments/expenses', {
            method: 'POST',
            body: JSON.stringify({
                title: '   ',
                amount: 100,
                expense_date: '2026-06-27',
            }),
        }));
        expect(invalid.status).toBe(422);
        expect(await invalid.json()).toMatchObject({ errors: { title: expect.any(Array) } });

        const response = await POST(new Request('http://localhost/api/v1/payments/expenses', {
            method: 'POST',
            body: JSON.stringify({
                title: '  Implant supplies  ',
                amount: 100,
                quantity: null,
                currency: ' usd ',
                expense_date: '2026-06-27',
            }),
        }));
        expect(response.status).toBe(201);
        const created = await response.json() as { data: { id: string } };
        createdIds.push(created.data.id);
        expect(created.data).toMatchObject({
            title: 'Implant supplies',
            quantity: 1,
            currency: 'USD',
        });
    });

    it('validates updates before mutating the mock store', async () => {
        const expense = PAYMENT_EXPENSES[0];
        expect(expense).toBeDefined();
        const before = { ...expense };

        const response = await PUT(new Request('http://localhost/api/v1/payments/expenses/update', {
            method: 'PUT',
            body: JSON.stringify({
                title: ' ',
                amount: -1,
                quantity: 0,
                currency: 'EUR',
                expense_date: 'not-a-date',
            }),
        }), { params: Promise.resolve({ id: expense!.id }) });

        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({
            errors: {
                title: expect.any(Array),
                amount: expect.any(Array),
                quantity: expect.any(Array),
                currency: expect.any(Array),
                expense_date: expect.any(Array),
            },
        });
        expect(PAYMENT_EXPENSES.find((row) => row.id === expense!.id)).toEqual(before);
    });

    it('honors and validates include_summary like the backend contract', async () => {
        const withoutSummary = await GET(new Request(
            'http://localhost/api/v1/payments/expenses?include_summary=0'
        ));
        expect(withoutSummary.status).toBe(200);
        const responseBody = await withoutSummary.json();
        expect(responseBody).not.toHaveProperty('meta.summary');
        expect(responseBody).toHaveProperty('meta.pagination.per_page', 10);

        const invalid = await GET(new Request(
            'http://localhost/api/v1/payments/expenses?include_summary=invalid'
        ));
        expect(invalid.status).toBe(422);
        expect(await invalid.json()).toMatchObject({
            errors: { include_summary: expect.any(Array) },
        });
    });
});
