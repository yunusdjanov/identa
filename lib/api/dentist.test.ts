import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiDeleteMock, apiGetMock, apiPostMock, apiPutMock, withCsrfRetryMock } = vi.hoisted(() => ({
    apiDeleteMock: vi.fn(),
    apiGetMock: vi.fn(),
    apiPostMock: vi.fn(),
    apiPutMock: vi.fn(),
    withCsrfRetryMock: vi.fn((operation: () => unknown) => operation()),
}));

vi.mock('@/lib/api/client', () => ({
    apiClient: {
        get: apiGetMock,
        post: apiPostMock,
        put: apiPutMock,
        patch: vi.fn(),
        delete: apiDeleteMock,
    },
    ensureCsrfCookie: vi.fn(),
    withCsrfRetry: withCsrfRetryMock,
}));

import {
    getAdminAnalyticsSummary,
    getAnalyticsSummary,
    listAllPatients,
    createPaymentExpense,
    deletePaymentExpense,
    listPaymentExpenses,
    listPaymentLedgerHistory,
    listPaymentLedgerPatients,
    updatePaymentExpense,
} from '@/lib/api/dentist';

describe('dentist api pagination aggregation', () => {
    beforeEach(() => {
        apiGetMock.mockReset();
        apiDeleteMock.mockReset();
        apiPostMock.mockReset();
        apiPutMock.mockReset();
        withCsrfRetryMock.mockClear();
    });

    it('aggregates all patient pages until total_pages is reached', async () => {
        apiGetMock
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            id: 'p-1',
                            patient_id: 'PT-1',
                            full_name: 'Alice',
                            phone: '+10000000001',
                        },
                    ],
                    meta: {
                        pagination: {
                            page: 1,
                            per_page: 500,
                            total: 2,
                            total_pages: 2,
                        },
                    },
                },
            })
            .mockResolvedValueOnce({
                data: {
                    data: [
                        {
                            id: 'p-2',
                            patient_id: 'PT-2',
                            full_name: 'Bob',
                            phone: '+10000000002',
                        },
                    ],
                    meta: {
                        pagination: {
                            page: 2,
                            per_page: 500,
                            total: 2,
                            total_pages: 2,
                        },
                    },
                },
            });

        const result = await listAllPatients({ sort: 'full_name' });

        expect(result).toHaveLength(2);
        expect(result.map((patient) => patient.full_name)).toEqual(['Alice', 'Bob']);
        expect(apiGetMock).toHaveBeenNthCalledWith(1, '/patients', {
            params: { page: 1, per_page: 500, sort: 'full_name' },
        });
        expect(apiGetMock).toHaveBeenNthCalledWith(2, '/patients', {
            params: { page: 2, per_page: 500, sort: 'full_name' },
        });
    });

    it('limits collect-all pagination fanout to small batches', async () => {
        const pendingPages = new Map<number, () => void>();
        const pageResponse = (page: number, totalPages: number) => ({
            data: {
                data: [
                    {
                        id: `p-${page}`,
                        patient_id: `PT-${page}`,
                        full_name: `Patient ${page}`,
                        phone: `+1000000000${page}`,
                    },
                ],
                meta: {
                    pagination: {
                        page,
                        per_page: 500,
                        total: totalPages,
                        total_pages: totalPages,
                    },
                },
            },
        });

        apiGetMock.mockImplementation((_, config) => {
            const page = Number(config?.params?.page ?? 1);
            if (page === 1) {
                return Promise.resolve(pageResponse(page, 6));
            }

            return new Promise((resolve) => {
                pendingPages.set(page, () => resolve(pageResponse(page, 6)));
            });
        });

        const resultPromise = listAllPatients({ sort: 'full_name' });
        await Promise.resolve();
        await Promise.resolve();

        expect(apiGetMock).toHaveBeenCalledTimes(4);
        expect(apiGetMock.mock.calls.map((call) => call[1]?.params?.page)).toEqual([1, 2, 3, 4]);

        pendingPages.get(2)?.();
        pendingPages.get(3)?.();
        pendingPages.get(4)?.();
        await vi.waitFor(() => {
            expect(apiGetMock).toHaveBeenCalledTimes(6);
        });

        expect(apiGetMock.mock.calls.map((call) => call[1]?.params?.page)).toEqual([1, 2, 3, 4, 5, 6]);

        pendingPages.get(5)?.();
        pendingPages.get(6)?.();
        await expect(resultPromise).resolves.toHaveLength(6);
    });

    it('refuses pagination metadata that would create an unbounded browser fetch', async () => {
        apiGetMock.mockResolvedValueOnce({
            data: {
                data: [],
                meta: {
                    pagination: {
                        page: 1,
                        per_page: 100,
                        total: 10_100,
                        total_pages: 101,
                    },
                },
            },
        });

        await expect(listAllPatients()).rejects.toThrow(
            'This result contains more than 100 pages. Narrow the selected filters before loading it.'
        );
        expect(apiGetMock).toHaveBeenCalledTimes(1);
    });

    it('loads dentist analytics summary with explicit range bounds', async () => {
        apiGetMock.mockResolvedValueOnce({
            data: {
                data: {
                    currency: 'USD',
                    permissions: { payments: true, patients: true, appointments: true },
                    kpis: {
                        revenue: { current: 0, previous: 0 },
                        debt: { current: 0, previous: null },
                        patients: { current: 0, previous: 0 },
                        visits: { current: 0, previous: 0 },
                    },
                    buckets: [],
                    appointment_status: [],
                    top_debtors: [],
                },
            },
        });

        await getAnalyticsSummary({
            range: '7d',
            current_from: '2026-06-01',
            current_to: '2026-06-07',
            previous_from: '2026-05-25',
            previous_to: '2026-05-31',
            currency: 'USD',
        });

        expect(apiGetMock).toHaveBeenCalledWith('/analytics/summary', {
            params: {
                range: '7d',
                current_from: '2026-06-01',
                current_to: '2026-06-07',
                previous_from: '2026-05-25',
                previous_to: '2026-05-31',
                currency: 'USD',
            },
        });
    });

    it('loads admin analytics summary with explicit range bounds', async () => {
        apiGetMock.mockResolvedValueOnce({
            data: {
                data: {
                    kpis: {
                        active_dentists: { current: 0, previous: 0 },
                        mrr: { current: 0, previous: 0, currency: 'UZS' },
                        signups: { current: 0, previous: 0 },
                        conversion: { current: 0, previous: 0 },
                    },
                    signup_growth: [],
                    subscription_health: [],
                },
            },
        });

        await getAdminAnalyticsSummary({
            range: '30d',
            current_from: '2026-06-01',
            current_to: '2026-06-30',
            previous_from: '2026-05-02',
            previous_to: '2026-05-31',
        });

        expect(apiGetMock).toHaveBeenCalledWith('/admin/analytics/summary', {
            params: {
                range: '30d',
                current_from: '2026-06-01',
                current_to: '2026-06-30',
                previous_from: '2026-05-02',
                previous_to: '2026-05-31',
            },
        });
    });

    it('loads payment patient ledger with pagination and filters', async () => {
        apiGetMock.mockResolvedValueOnce({
            data: {
                data: [],
                meta: {
                    pagination: { page: 2, per_page: 10, total: 0, total_pages: 1 },
                    summary: { total_debt: 0, total_paid: 0, total_balance: 0, total_patients: 0, total_entries: 0 },
                },
            },
        });

        await listPaymentLedgerPatients({
            page: 2,
            perPage: 10,
            filter: {
                patient_id: 'p-1',
                outstanding: true,
                search: 'ali',
            },
        });

        expect(apiGetMock).toHaveBeenCalledWith('/payments/ledger/patients', {
            params: {
                page: 2,
                per_page: 10,
                filter: {
                    patient_id: 'p-1',
                    outstanding: true,
                    search: 'ali',
                },
            },
        });
    });

    it('loads payment history ledger with pagination and filters', async () => {
        apiGetMock.mockResolvedValueOnce({
            data: {
                data: [],
                meta: {
                    pagination: { page: 1, per_page: 10, total: 0, total_pages: 1 },
                    summary: { total_debt: 0, total_paid: 0, total_balance: 0, total_entries: 0 },
                },
            },
        });

        await listPaymentLedgerHistory({
            page: 1,
            perPage: 10,
            filter: {
                outstanding: true,
                search: 'root',
            },
        });

        expect(apiGetMock).toHaveBeenCalledWith('/payments/ledger/history', {
            params: {
                page: 1,
                per_page: 10,
                filter: {
                    outstanding: true,
                    search: 'root',
                },
            },
        });
    });

    it('loads payment expenses with pagination and filters', async () => {
        apiGetMock.mockResolvedValueOnce({
            data: {
                data: [],
                meta: {
                    pagination: { page: 1, per_page: 10, total: 0, total_pages: 1 },
                    summary: { total_count: 0, total_amount: 0, current_month_amount: 0, latest_expense_date: null },
                },
            },
        });

        await listPaymentExpenses({
            page: 1,
            perPage: 10,
            filter: {
                search: 'rent',
            },
        });

        expect(apiGetMock).toHaveBeenCalledWith('/payments/expenses', {
            params: {
                page: 1,
                per_page: 10,
                filter: {
                    search: 'rent',
                },
            },
        });
    });

    it('creates payment expenses', async () => {
        apiPostMock.mockResolvedValueOnce({
            data: {
                data: {
                    id: 'expense-1',
                    title: 'Rent',
                    amount: 1200000,
                    quantity: 1,
                    currency: 'UZS',
                    expense_date: '2026-06-27',
                    created_at: '2026-06-27T10:00:00Z',
                    updated_at: '2026-06-27T10:00:00Z',
                },
            },
        });

        const expense = await createPaymentExpense({
            title: 'Rent',
            amount: 1200000,
            quantity: 2,
            currency: 'USD',
            expense_date: '2026-06-27',
        });

        expect(expense.title).toBe('Rent');
        expect(withCsrfRetryMock).toHaveBeenCalledTimes(1);
        expect(apiPostMock).toHaveBeenCalledWith('/payments/expenses', {
            title: 'Rent',
            amount: 1200000,
            quantity: 2,
            currency: 'USD',
            expense_date: '2026-06-27',
        }, {
            headers: {
                'Idempotency-Key': expect.stringMatching(/^expense-/),
            },
        });
    });

    it('updates and deletes payment expenses', async () => {
        apiPutMock.mockResolvedValueOnce({
            data: {
                data: {
                    id: 'expense-1',
                    title: 'Materials',
                    amount: 450000,
                    quantity: 3,
                    currency: 'UZS',
                    expense_date: '2026-06-27',
                    created_at: '2026-06-27T10:00:00Z',
                    updated_at: '2026-06-27T11:00:00Z',
                },
            },
        });
        apiDeleteMock.mockResolvedValueOnce({});

        await updatePaymentExpense('expense-1', {
            title: 'Materials',
            amount: 450000,
            quantity: 3,
            currency: 'UZS',
            expense_date: '2026-06-27',
        });
        await deletePaymentExpense('expense-1');

        expect(withCsrfRetryMock).toHaveBeenCalledTimes(2);
        expect(apiPutMock).toHaveBeenCalledWith('/payments/expenses/expense-1', {
            title: 'Materials',
            amount: 450000,
            quantity: 3,
            currency: 'UZS',
            expense_date: '2026-06-27',
        });
        expect(apiDeleteMock).toHaveBeenCalledWith('/payments/expenses/expense-1');
    });
});
