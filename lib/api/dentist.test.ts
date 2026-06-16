import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiGetMock } = vi.hoisted(() => ({
    apiGetMock: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
    apiClient: {
        get: apiGetMock,
        post: vi.fn(),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
    },
    ensureCsrfCookie: vi.fn(),
}));

import {
    getPatientOdontogramSummary,
    listAllPatientOdontogram,
    listAllPatients,
    listPaymentLedgerHistory,
    listPaymentLedgerPatients,
} from '@/lib/api/dentist';

describe('dentist api pagination aggregation', () => {
    beforeEach(() => {
        apiGetMock.mockReset();
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

    it('passes query filters for patient odontogram aggregation', async () => {
        apiGetMock.mockResolvedValueOnce({
            data: {
                data: [
                    {
                        id: 'o-1',
                        patient_id: 'p-1',
                        tooth_number: 14,
                        condition_type: 'cavity',
                        surface: null,
                        material: null,
                        severity: null,
                        condition_date: '2026-02-14',
                        notes: null,
                        created_at: null,
                    },
                ],
                meta: {
                    pagination: {
                        page: 1,
                        per_page: 500,
                        total: 1,
                        total_pages: 1,
                    },
                },
            },
        });

        const result = await listAllPatientOdontogram('p-1', {
            sort: 'tooth_number,condition_date',
            filter: { tooth_number: 14 },
        });

        expect(result).toHaveLength(1);
        expect(apiGetMock).toHaveBeenCalledWith('/patients/p-1/odontogram', {
            params: {
                page: 1,
                per_page: 500,
                sort: 'tooth_number,condition_date',
                filter: { tooth_number: 14 },
            },
        });
    });

    it('loads patient odontogram summary with default limit', async () => {
        apiGetMock.mockResolvedValueOnce({
            data: {
                data: {
                    total_entries: 3,
                    affected_teeth_count: 2,
                    latest_conditions: [],
                },
            },
        });

        const result = await getPatientOdontogramSummary('p-1');

        expect(result.total_entries).toBe(3);
        expect(apiGetMock).toHaveBeenCalledWith('/patients/p-1/odontogram/summary', {
            params: { limit: 5 },
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
});
