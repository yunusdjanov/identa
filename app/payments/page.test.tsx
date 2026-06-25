import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentsPage from '@/app/payments/page';
import { getCurrentUser, listPaymentLedgerHistory, listPaymentLedgerPatients } from '@/lib/api/dentist';
import type { ApiSubscriptionSummary } from '@/lib/api/types';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { exportRowsToPdf } from '@/lib/export/pdf';

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    listPaymentLedgerHistory: vi.fn(),
    listPaymentLedgerPatients: vi.fn(),
}));

vi.mock('@/lib/export/pdf', () => ({
    buildPdfFilename: vi.fn((prefix: string) => `${prefix}.pdf`),
    exportRowsToPdf: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

interface MockLedgerOptions {
    page?: number;
    perPage?: number;
    filter?: {
        patient_id?: string;
        outstanding?: string;
        search?: string;
    };
}

let patientLedgerRows: Array<{
    patient_id: string;
    patient_code: string;
    patient_name: string;
    patient_phone: string;
    total_debt: number;
    total_paid: number;
    balance: number;
    entry_count: number;
    last_entry_date: string | null;
}>;

let historyLedgerRows: Array<{
    id: string;
    patient_id: string;
    patient_name: string;
    patient_phone: string;
    date: string;
    teeth: number[];
    work_done: string;
    comment: string | null;
    debt: number;
    paid: number;
    balance_delta: number;
    created_by?: { id: string; name: string; role: 'assistant' | 'dentist' | 'admin' } | null;
    updated_by?: { id: string; name: string; role: 'assistant' | 'dentist' | 'admin' } | null;
}>;

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <PaymentsPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

function normalizeText(value: string | null | undefined) {
    return (value ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

const EXPORT_ENABLED_SUBSCRIPTION: ApiSubscriptionSummary = {
    is_configured: true,
    plan: 'pro',
    plan_name: 'Pro',
    billing_period: 'monthly',
    status: 'active',
    access_mode: 'full',
    starts_at: '2026-01-01T00:00:00.000000Z',
    ends_at: null,
    trial_ends_at: null,
    grace_ends_at: null,
    cancel_at_period_end: false,
    cancelled_at: null,
    days_remaining: null,
    staff_limit: 5,
    active_staff_count: 1,
    entry_image_limit: 10,
    upload_max_mb: 8,
    stored_image_max_mb: 8,
    can_export: true,
    is_read_only: false,
    payment_method: null,
    payment_amount: null,
    note: null,
};

function paginateRows<T>(rows: T[], options?: MockLedgerOptions) {
    const perPage = options?.perPage ?? 10;
    const page = options?.page ?? 1;
    const start = (page - 1) * perPage;

    return {
        data: rows.slice(start, start + perPage),
        meta: {
            pagination: {
                page,
                per_page: perPage,
                total: rows.length,
                total_pages: Math.max(1, Math.ceil(rows.length / perPage)),
            },
        },
    };
}

function filteredPatientRows(options?: MockLedgerOptions) {
    const search = options?.filter?.search?.trim().toLowerCase() ?? '';

    return patientLedgerRows
        .filter((row) => (options?.filter?.patient_id ? row.patient_id === options.filter.patient_id : true))
        .filter((row) => (options?.filter?.outstanding === '1' ? row.balance > 0 : true))
        .filter((row) => {
            if (!search) {
                return true;
            }

            return [row.patient_name, row.patient_phone, row.patient_code].join(' ').toLowerCase().includes(search);
        });
}

function filteredHistoryRows(options?: MockLedgerOptions) {
    const search = options?.filter?.search?.trim().toLowerCase() ?? '';
    const outstandingPatientIds = new Set(patientLedgerRows.filter((row) => row.balance > 0).map((row) => row.patient_id));

    return historyLedgerRows
        .filter((row) => (options?.filter?.patient_id ? row.patient_id === options.filter.patient_id : true))
        .filter((row) => (options?.filter?.outstanding === '1' ? outstandingPatientIds.has(row.patient_id) : true))
        .filter((row) => {
            if (!search) {
                return true;
            }

            return [
                row.patient_name,
                row.patient_phone,
                row.work_done,
                row.comment ?? '',
                row.teeth.join(' '),
            ].join(' ').toLowerCase().includes(search);
        });
}

function patientSummary(rows: typeof patientLedgerRows) {
    return rows.reduce(
        (summary, row) => {
            summary.total_debt += row.total_debt;
            summary.total_paid += row.total_paid;
            summary.total_balance += row.balance;
            summary.total_entries += row.entry_count;
            summary.total_patients += 1;
            return summary;
        },
        {
            total_debt: 0,
            total_paid: 0,
            total_balance: 0,
            total_entries: 0,
            total_patients: 0,
        }
    );
}

function setupLedgerMocks() {
    vi.mocked(listPaymentLedgerPatients).mockImplementation(async (options?: MockLedgerOptions) => {
        const rows = filteredPatientRows(options);
        return {
            ...paginateRows(rows, options),
            meta: {
                ...paginateRows(rows, options).meta,
                summary: patientSummary(rows),
            },
        } as never;
    });
    vi.mocked(listPaymentLedgerHistory).mockImplementation(async (options?: MockLedgerOptions) => {
        const rows = filteredHistoryRows(options);
        const page = paginateRows(rows, options);
        return {
            ...page,
            meta: {
                ...page.meta,
                summary: {
                    total_debt: rows.reduce((sum, row) => sum + row.debt, 0),
                    total_paid: rows.reduce((sum, row) => sum + row.paid, 0),
                    total_balance: rows.reduce((sum, row) => sum + row.balance_delta, 0),
                    total_entries: rows.length,
                },
            },
        } as never;
    });
}

describe('PaymentsPage', () => {
    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        vi.mocked(listPaymentLedgerPatients).mockReset();
        vi.mocked(listPaymentLedgerHistory).mockReset();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(exportRowsToPdf).mockClear();
        window.history.replaceState({}, '', '/payments');

        vi.mocked(getCurrentUser).mockResolvedValue({
            id: 'user-1',
            name: 'Dr. Test',
            email: 'doctor@example.test',
            role: 'dentist',
            account_status: 'active',
            subscription: EXPORT_ENABLED_SUBSCRIPTION,
        });
        patientLedgerRows = [
            {
                patient_id: 'patient-1',
                patient_code: 'PT-1001',
                patient_name: 'Jane Doe',
                patient_phone: '+998900000001',
                total_debt: 120000,
                total_paid: 70000,
                balance: 50000,
                entry_count: 1,
                last_entry_date: '2026-03-14',
            },
            {
                patient_id: 'patient-2',
                patient_code: 'PT-1002',
                patient_name: 'John Smith',
                patient_phone: '+998900000002',
                total_debt: 50000,
                total_paid: 50000,
                balance: 0,
                entry_count: 1,
                last_entry_date: '2026-03-10',
            },
        ];
        historyLedgerRows = [
            {
                id: 'tr-1',
                patient_id: 'patient-1',
                patient_name: 'Jane Doe',
                patient_phone: '+998900000001',
                date: '2026-03-14',
                teeth: [12],
                work_done: 'Composite filling',
                comment: 'Upper left premolar',
                debt: 120000,
                paid: 70000,
                balance_delta: 50000,
            },
            {
                id: 'tr-2',
                patient_id: 'patient-2',
                patient_name: 'John Smith',
                patient_phone: '+998900000002',
                date: '2026-03-10',
                teeth: [],
                work_done: 'Teeth cleaning',
                comment: null,
                debt: 50000,
                paid: 50000,
                balance_delta: 0,
            },
        ];
        setupLedgerMocks();
    });

    it('renders patient balances and links to patient history page', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
            expect(screen.getByText('John Smith')).toBeInTheDocument();
        });

        expect(screen.getAllByText('Work total').length).toBeGreaterThan(0);
        expect(screen.getByText('Total Paid')).toBeInTheDocument();
        expect(
            screen.getByText((_, element) => normalizeText(element?.textContent) === '170 000 UZS')
        ).toBeInTheDocument();
        expect(
            screen.getAllByText((_, element) => normalizeText(element?.textContent) === '120 000 UZS').length
        ).toBeGreaterThan(0);

        const janeRow = screen.getByText('Jane Doe').closest('tr');
        expect(janeRow).not.toBeNull();
        const janeBalanceCell = within(janeRow as HTMLElement).getAllByRole('cell')[6];
        expect(within(janeBalanceCell).getByText('Debt')).toBeInTheDocument();
        expect(
            within(janeBalanceCell).getByText((_, element) => normalizeText(element?.textContent) === '50 000 UZS')
        ).toBeInTheDocument();

        const historyLink = within(janeRow as HTMLElement).getByRole('link', { name: 'History' });
        expect(historyLink).toHaveAttribute('href', '/patients/patient-1/history?from=payments');
    });

    it('renders the total patients summary with the teal accent', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        });

        const totalPatientsCard = screen.getByText('Total Patients').closest('.interactive-card') as HTMLElement;
        expect(totalPatientsCard).not.toBeNull();
        expect(totalPatientsCard).toHaveClass('metric-hover-teal');
        expect(totalPatientsCard).toHaveClass('border-cyan-200');
        expect(totalPatientsCard).not.toHaveClass('metric-hover-blue');
    });

    it('labels a negative remaining summary as advance without a minus sign', async () => {
        patientLedgerRows = [
            {
                patient_id: 'patient-advance',
                patient_code: 'PT-1009',
                patient_name: 'Advance Patient',
                patient_phone: '+998900000009',
                total_debt: 0,
                total_paid: 250000,
                balance: -250000,
                entry_count: 1,
                last_entry_date: '2026-03-18',
            },
        ];
        historyLedgerRows = [];

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Advance Patient')).toBeInTheDocument();
        });

        expect(screen.getAllByText('Advance').length).toBeGreaterThanOrEqual(2);
        const netBalanceCard = screen.getByText('Paid amount exceeds work total.').closest('.interactive-card') as HTMLElement;
        expect(netBalanceCard).not.toBeNull();
        expect(within(netBalanceCard).getByText('Advance')).toBeInTheDocument();
        expect(
            within(netBalanceCard).getByText((_, element) => normalizeText(element?.textContent) === '250 000 UZS')
        ).toBeInTheDocument();
        expect(normalizeText(netBalanceCard.textContent)).not.toContain('-250 000 UZS');

        const advanceRow = screen.getByText('Advance Patient').closest('tr') as HTMLElement;
        const advanceBalanceCell = within(advanceRow).getAllByRole('cell')[6];
        expect(within(advanceBalanceCell).getByText('Advance')).toBeInTheDocument();
        expect(
            within(advanceBalanceCell).getByText((_, element) => normalizeText(element?.textContent) === '250 000 UZS')
        ).toBeInTheDocument();
        expect(normalizeText(advanceRow.textContent)).not.toContain('-250 000 UZS');
    });

    it('hides the settled badge on rows with no work and no payment', async () => {
        patientLedgerRows.push({
            patient_id: 'patient-zero',
            patient_code: 'PT-1010',
            patient_name: 'Zero Patient',
            patient_phone: '+998900000010',
            total_debt: 0,
            total_paid: 0,
            balance: 0,
            entry_count: 0,
            last_entry_date: null,
        });
        historyLedgerRows.push({
            id: 'tr-zero',
            patient_id: 'patient-zero',
            patient_name: 'Zero Patient',
            patient_phone: '+998900000010',
            date: '2026-03-20',
            teeth: [],
            work_done: 'No charge note',
            comment: null,
            debt: 0,
            paid: 0,
            balance_delta: 0,
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Zero Patient')).toBeInTheDocument();
        });

        const zeroPatientRow = screen.getByText('Zero Patient').closest('tr') as HTMLElement;
        const zeroPatientBalanceCell = within(zeroPatientRow).getAllByRole('cell')[6];
        expect(normalizeText(zeroPatientBalanceCell.textContent)).toContain('0 UZS');
        expect(within(zeroPatientBalanceCell).queryByText('Paid')).not.toBeInTheDocument();

        const settledPatientRow = screen.getByText('John Smith').closest('tr') as HTMLElement;
        const settledPatientBalanceCell = within(settledPatientRow).getAllByRole('cell')[6];
        expect(within(settledPatientBalanceCell).getByText('Paid')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'History' }));

        await waitFor(() => {
            expect(screen.getByText('No charge note')).toBeInTheDocument();
        });

        const zeroHistoryRow = screen.getByText('No charge note').closest('tr') as HTMLElement;
        const zeroHistoryBalanceCell = within(zeroHistoryRow).getAllByRole('cell')[6];
        expect(within(zeroHistoryBalanceCell).queryByText('Paid')).not.toBeInTheDocument();
    });

    it('switches to the global history tab and shows treatment rows', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'History' }));

        await waitFor(() => {
            expect(screen.getByText('Entry History')).toBeInTheDocument();
            expect(screen.getAllByText('Composite filling').length).toBeGreaterThan(0);
            expect(screen.getByText('Teeth cleaning')).toBeInTheDocument();
        });

        expect(screen.getByTitle('24')).toBeInTheDocument();
        expect(screen.queryByTitle('12')).not.toBeInTheDocument();

        const compositeRow = screen.getAllByText('Composite filling')[0].closest('tr') as HTMLElement;
        const compositeBalanceCell = within(compositeRow).getAllByRole('cell')[6];
        expect(within(compositeBalanceCell).getByText('Debt')).toBeInTheDocument();
    });

    it('shows treatment authors in the global history tab when enabled', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
            id: 'user-1',
            name: 'Dr. Test',
            email: 'doctor@example.test',
            role: 'dentist',
            account_status: 'active',
            show_record_authors: true,
            subscription: EXPORT_ENABLED_SUBSCRIPTION,
        } as never);
        patientLedgerRows = [
            {
                patient_id: 'patient-1',
                patient_code: 'PT-1001',
                patient_name: 'Jane Doe',
                patient_phone: '+998900000001',
                total_debt: 120000,
                total_paid: 70000,
                balance: 50000,
                entry_count: 1,
                last_entry_date: '2026-03-14',
            },
        ];
        historyLedgerRows = [
            {
                id: 'tr-author',
                patient_id: 'patient-1',
                patient_name: 'Jane Doe',
                patient_phone: '+998900000001',
                date: '2026-03-14',
                teeth: [12],
                work_done: 'Composite filling',
                comment: null,
                debt: 120000,
                paid: 70000,
                balance_delta: 50000,
                created_by: { id: 'assistant-1', name: 'Front Desk', role: 'assistant' },
                updated_by: { id: 'assistant-1', name: 'Front Desk', role: 'assistant' },
            },
        ];
        renderPage();

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'History' }));

        await waitFor(() => {
            expect(screen.getByText('by Front Desk')).toBeInTheDocument();
        });

        const historyRow = screen.getByText('Jane Doe').closest('tr') as HTMLElement;
        const historyCells = within(historyRow).getAllByRole('cell');

        expect(within(historyCells[1]).getByText('by Front Desk')).toBeInTheDocument();
        expect(within(historyCells[3]).queryByText('by Front Desk')).not.toBeInTheDocument();
        expect(screen.getByTitle('Created by Front Desk')).toBeInTheDocument();
    });

    it('filters payments to patients with outstanding debt and exports the filtered rows', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
            expect(screen.getByText('John Smith')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'With debt' }));

        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
            expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
        });

        expect(screen.getByRole('button', { name: 'With debt' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'With debt' })).toHaveAttribute('title', 'Clear debt filter.');
        expect(window.location.search).toContain('outstanding=1');

        fireEvent.click(screen.getByRole('button', { name: 'History' }));

        await waitFor(() => {
            expect(screen.getByText('Entry History')).toBeInTheDocument();
            expect(screen.getAllByText('Composite filling').length).toBeGreaterThan(0);
            expect(screen.queryByText('Teeth cleaning')).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));

        await waitFor(() => {
            expect(exportRowsToPdf).toHaveBeenCalledTimes(1);
        });
        expect(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].rows).toHaveLength(1);
        expect(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].rows[0]?.[0]).toBe('Jane Doe');
        expect(normalizeText(String(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].rows[0]?.[5]))).toBe('50 000 UZS (Debt)');
        expect(normalizeText(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].summary?.[2]?.value)).toBe('50 000 UZS (Debt)');
        expect(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].locale).toBe('en');
    });
});
