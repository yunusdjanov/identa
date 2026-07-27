import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentsPage from '@/app/payments/page';
import {
    createPaymentExpense,
    deletePaymentExpense,
    getCurrentUser,
    listPaymentExpenses,
    listPaymentLedgerPatients,
    updatePaymentExpense,
} from '@/lib/api/dentist';
import type { ApiPaymentPatientLedgerRow, ApiSubscriptionSummary } from '@/lib/api/types';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { exportRowsToPdf } from '@/lib/export/pdf';

vi.mock('@/lib/api/dentist', () => ({
    createPaymentExpense: vi.fn(),
    deletePaymentExpense: vi.fn(),
    getCurrentUser: vi.fn(),
    listPaymentExpenses: vi.fn(),
    listPaymentLedgerPatients: vi.fn(),
    updatePaymentExpense: vi.fn(),
}));

vi.mock('@/lib/export/pdf', () => ({
    buildPdfFilename: vi.fn((prefix: string) => `${prefix}.pdf`),
    exportRowsToPdf: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

interface MockLedgerOptions {
    page?: number;
    perPage?: number;
    includePatientPhoto?: boolean;
    filter?: {
        patient_id?: string;
        outstanding?: string;
        search?: string;
    };
}

let patientLedgerRows: ApiPaymentPatientLedgerRow[];

let expenseRows: Array<{
    id: string;
    title: string;
    amount: number;
    quantity: number;
    currency: 'UZS' | 'USD';
    expense_date: string;
    created_at: string;
    updated_at: string;
}>;

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

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
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

function filteredExpenseRows(options?: MockLedgerOptions) {
    const search = options?.filter?.search?.trim().toLowerCase() ?? '';

    return expenseRows.filter((row) => {
        if (!search) {
            return true;
        }

        return row.title.toLowerCase().includes(search);
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
            const balancesByCurrency = row.balances_by_currency ?? {
                UZS: { total_debt: row.total_debt, total_paid: row.total_paid, balance: row.balance },
            };
            for (const currency of ['UZS', 'USD'] as const) {
                const balance = balancesByCurrency[currency];
                if (!balance) {
                    continue;
                }
                summary.totals_by_currency[currency].total_debt += balance.total_debt;
                summary.totals_by_currency[currency].total_paid += balance.total_paid;
                summary.totals_by_currency[currency].total_balance += balance.balance;
            }
            return summary;
        },
        {
            total_debt: 0,
            total_paid: 0,
            total_balance: 0,
            total_entries: 0,
            total_patients: 0,
            totals_by_currency: {
                UZS: { total_debt: 0, total_paid: 0, total_balance: 0 },
                USD: { total_debt: 0, total_paid: 0, total_balance: 0 },
            },
        }
    );
}

function expenseSummary(rows: typeof expenseRows) {
    const totalsByCurrency = { UZS: 0, USD: 0 };
    const currentMonthByCurrency = { UZS: 0, USD: 0 };
    for (const row of rows) {
        totalsByCurrency[row.currency] += row.amount;
        if (row.expense_date.startsWith('2026-06')) {
            currentMonthByCurrency[row.currency] += row.amount;
        }
    }

    return {
        total_count: rows.length,
        total_amount: rows.reduce((sum, row) => sum + row.amount, 0),
        current_month_amount: rows
            .filter((row) => row.expense_date.startsWith('2026-06'))
            .reduce((sum, row) => sum + row.amount, 0),
        totals_by_currency: totalsByCurrency,
        current_month_by_currency: currentMonthByCurrency,
        latest_expense_date: rows.reduce<string | null>((latest, row) => {
            return latest === null || row.expense_date > latest ? row.expense_date : latest;
        }, null),
    };
}

function setupLedgerMocks() {
    vi.mocked(listPaymentLedgerPatients).mockImplementation(async (options?: MockLedgerOptions) => {
        const rows = filteredPatientRows(options);
        const page = paginateRows(rows, options);
        return {
            ...page,
            meta: {
                ...page.meta,
                summary: patientSummary(rows),
            },
        } as never;
    });
    vi.mocked(listPaymentExpenses).mockImplementation(async (options?: MockLedgerOptions) => {
        const rows = filteredExpenseRows(options);
        const page = paginateRows(rows, options);
        return {
            ...page,
            meta: {
                ...page.meta,
                summary: expenseSummary(rows),
            },
        } as never;
    });
}

describe('PaymentsPage', () => {
    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        vi.mocked(createPaymentExpense).mockReset();
        vi.mocked(deletePaymentExpense).mockReset();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(listPaymentExpenses).mockReset();
        vi.mocked(listPaymentLedgerPatients).mockReset();
        vi.mocked(updatePaymentExpense).mockReset();
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
        vi.mocked(createPaymentExpense).mockResolvedValue({
            id: 'expense-created',
            title: 'Rent',
            amount: 1200000,
            quantity: 1,
            currency: 'UZS',
            expense_date: '2026-06-27',
            created_at: '2026-06-27T10:00:00Z',
            updated_at: '2026-06-27T10:00:00Z',
        });
        vi.mocked(updatePaymentExpense).mockResolvedValue({
            id: 'expense-1',
            title: 'Materials',
            amount: 750000,
            quantity: 2,
            currency: 'USD',
            expense_date: '2026-06-27',
            created_at: '2026-06-12T10:00:00Z',
            updated_at: '2026-06-27T10:00:00Z',
        });
        vi.mocked(deletePaymentExpense).mockResolvedValue(undefined);
        patientLedgerRows = [
            {
                patient_id: 'patient-1',
                patient_code: 'PT-1001',
                patient_name: 'Jane Doe',
                patient_phone: '+998900000001',
                patient_photo_scan_status: 'approved',
                patient_photo_url: 'https://api.identa.test/api/v1/patients/patient-1/photo',
                patient_photo_thumbnail_url: 'https://api.identa.test/api/v1/patients/patient-1/photo?variant=thumbnail',
                patient_photo_preview_url: 'https://api.identa.test/api/v1/patients/patient-1/photo?variant=preview',
                patient_photo_thumbnail_ready: true,
                patient_photo_preview_ready: true,
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
                patient_photo_scan_status: 'approved',
                patient_photo_url: null,
                patient_photo_thumbnail_url: null,
                patient_photo_preview_url: null,
                total_debt: 50000,
                total_paid: 50000,
                balance: 0,
                entry_count: 1,
                last_entry_date: '2026-03-10',
            },
        ];
        expenseRows = [
            {
                id: 'expense-1',
                title: 'Materials',
                amount: 450000,
                quantity: 2,
                currency: 'UZS',
                expense_date: '2026-06-12',
                created_at: '2026-06-12T10:00:00Z',
                updated_at: '2026-06-12T10:00:00Z',
            },
            {
                id: 'expense-2',
                title: 'Rent',
                amount: 1200,
                quantity: 1,
                currency: 'USD',
                expense_date: '2026-05-30',
                created_at: '2026-05-30T10:00:00Z',
                updated_at: '2026-05-30T10:00:00Z',
            },
        ];
        setupLedgerMocks();
    });

    it('renders patient balances and links to the payment-focused patient view', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
            expect(screen.getByText('John Smith')).toBeInTheDocument();
        });

        expect(screen.queryByRole('button', { name: 'History' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Expenses' })).toBeInTheDocument();
        expect(screen.queryByText('Patient Balances')).not.toBeInTheDocument();
        expect(screen.queryByText('Patients in filter: 2')).not.toBeInTheDocument();
        expect(screen.getAllByText('Work total').length).toBeGreaterThan(0);
        expect(screen.getByText('Total Paid')).toBeInTheDocument();
        expect(listPaymentLedgerPatients).toHaveBeenCalledWith(
            expect.objectContaining({
                page: 1,
                perPage: 10,
                includePatientPhoto: true,
            })
        );
        expect(
            screen.getByText((_, element) => normalizeText(element?.textContent) === '170 000 UZS')
        ).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Photo' })).toBeInTheDocument();

        const janeRow = screen.getByText('Jane Doe').closest('tr');
        expect(janeRow).not.toBeNull();
        const janePhoto = within(janeRow as HTMLElement).getByRole('img', { name: 'Jane Doe' });
        expect(janePhoto).toHaveAttribute(
            'src',
            'https://api.identa.test/api/v1/patients/patient-1/photo?variant=thumbnail'
        );
        expect(janePhoto.closest('button')).toHaveClass('h-20', 'w-20', 'rounded-xl');
        const janeBalanceCell = within(janeRow as HTMLElement).getAllByRole('cell')[7];
        expect(within(janeBalanceCell).getByText('Debt')).toBeInTheDocument();

        const patientLink = within(janeRow as HTMLElement).getByRole('link', { name: 'Patient' });
        expect(patientLink).toHaveAttribute('href', '/payments/patients/patient-1');

        const johnRow = screen.getByText('John Smith').closest('tr');
        expect(johnRow).not.toBeNull();
        expect(within(johnRow as HTMLElement).getByText('JS')).toBeInTheDocument();
    });

    it('uses the protected photo fallback for legacy ledger rows and constrains long names', async () => {
        const longPatientName = 'Alexandria Catherine Montgomery-Wellington';
        patientLedgerRows = [
            {
                patient_id: 'patient-legacy',
                patient_code: 'PT-LEGACY',
                patient_name: longPatientName,
                patient_phone: '+998901234567',
                total_debt: 120000,
                total_paid: 70000,
                balance: 50000,
                entry_count: 1,
                last_entry_date: '2026-03-14',
            },
        ];

        renderPage();

        const truncatedName = `${longPatientName.slice(0, 24)}…`;
        const nameElement = await screen.findByText(truncatedName);
        expect(nameElement).toHaveAttribute('title', longPatientName);
        expect(nameElement).toHaveClass('truncate');

        const patientRow = nameElement.closest('tr');
        expect(patientRow).not.toBeNull();
        expect(patientRow?.closest('table')).toHaveClass('table-fixed');

        const fallbackPhoto = within(patientRow as HTMLElement).getByRole('img', {
            name: longPatientName,
        });
        expect(fallbackPhoto.getAttribute('src')).toContain(
            '/api/v1/patients/patient-legacy/photo?variant=thumbnail'
        );

        fireEvent.error(fallbackPhoto);

        expect(
            within(patientRow as HTMLElement).queryByRole('img', { name: longPatientName })
        ).not.toBeInTheDocument();
        expect(within(patientRow as HTMLElement).getByText('AC')).toBeInTheDocument();
    });

    it('keeps payment summary cards global while search and debt filters change the table', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
            expect(screen.getByText('John Smith')).toBeInTheDocument();
        });

        const workTotalLabel = screen
            .getAllByText('Work total')
            .find((element) => element.closest('.interactive-card'));
        const workTotalCard = workTotalLabel?.closest('.interactive-card') as HTMLElement;
        const paidCard = screen.getByText('Total Paid').closest('.interactive-card') as HTMLElement;
        const patientCountCard = screen.getByText('Total Patients').closest('.interactive-card') as HTMLElement;

        expect(normalizeText(workTotalCard.textContent)).toContain('170 000 UZS');
        expect(normalizeText(paidCard.textContent)).toContain('120 000 UZS');
        expect(normalizeText(patientCountCard.textContent)).toContain('2');

        fireEvent.change(screen.getByPlaceholderText('Search patients by name, phone, or patient ID...'), {
            target: { value: 'John' },
        });

        await waitFor(() => {
            expect(screen.getByText('John Smith')).toBeInTheDocument();
            expect(screen.queryByText('Jane Doe')).not.toBeInTheDocument();
        });

        expect(normalizeText(workTotalCard.textContent)).toContain('170 000 UZS');
        expect(normalizeText(paidCard.textContent)).toContain('120 000 UZS');
        expect(normalizeText(patientCountCard.textContent)).toContain('2');

        fireEvent.click(screen.getByRole('button', { name: 'With debt' }));

        await waitFor(() => {
            expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
        });

        expect(normalizeText(workTotalCard.textContent)).toContain('170 000 UZS');
        expect(normalizeText(paidCard.textContent)).toContain('120 000 UZS');
        expect(normalizeText(patientCountCard.textContent)).toContain('2');
        expect(listPaymentLedgerPatients).toHaveBeenCalledWith({
            page: 1,
            perPage: 1,
        });
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

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Advance Patient')).toBeInTheDocument();
        });

        expect(screen.getAllByText('Advance').length).toBeGreaterThanOrEqual(2);
        const netBalanceCard = screen.getByText('Paid amount exceeds work total.').closest('.interactive-card') as HTMLElement;
        expect(normalizeText(netBalanceCard.textContent)).not.toContain('-250 000 UZS');
    });

    it('shows debt and advance labels separately when balances are mixed by currency', async () => {
        patientLedgerRows = [
            {
                patient_id: 'patient-mixed',
                patient_code: 'PT-1011',
                patient_name: 'Mixed Currency Patient',
                patient_phone: '+998900000011',
                total_debt: 1820000,
                total_paid: 550000,
                balance: 1270000,
                balances_by_currency: {
                    UZS: { total_debt: 1820000, total_paid: 550000, balance: 1270000 },
                    USD: { total_debt: 200, total_paid: 205, balance: -5 },
                },
                entry_count: 2,
                last_entry_date: '2026-06-18',
            },
        ];

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Mixed Currency Patient')).toBeInTheDocument();
        });

        const netBalanceCard = screen.getByText('Debt and advance exist in different currencies.').closest('.interactive-card') as HTMLElement;
        const cardText = normalizeText(netBalanceCard.textContent);

        expect(cardText).toContain('1 270 000 UZS');
        expect(cardText).toContain('5 USD');
        expect(within(netBalanceCard).getByText('Debt')).toBeInTheDocument();
        expect(within(netBalanceCard).getByText('Advance')).toBeInTheDocument();
        expect(screen.queryByText('Balance is settled.')).not.toBeInTheDocument();
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

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Zero Patient')).toBeInTheDocument();
        });

        const zeroPatientRow = screen.getByText('Zero Patient').closest('tr') as HTMLElement;
        const zeroPatientBalanceCell = within(zeroPatientRow).getAllByRole('cell')[7];
        expect(normalizeText(zeroPatientBalanceCell.textContent)).toContain('0 UZS');
        expect(within(zeroPatientBalanceCell).queryByText('Paid')).not.toBeInTheDocument();
    });

    it('switches to expenses and shows expense rows with matching summary cards', async () => {
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Expenses' }));

        await waitFor(() => {
            expect(screen.getByText('Materials')).toBeInTheDocument();
            expect(screen.getByText('Rent')).toBeInTheDocument();
        });

        expect(screen.getByText('Total Expenses')).toBeInTheDocument();
        expect(screen.getByText('This Month')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Search expenses by title...')).toBeInTheDocument();
        expect(screen.getByLabelText('Quantity')).toHaveValue('1');
        expect(screen.getByRole('combobox', { name: 'Currency' })).toHaveTextContent('UZS');
        expect(screen.queryByText('Clinic Expenses')).not.toBeInTheDocument();
        expect(screen.queryByText('A simple dated log for expense title and amount.')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'With debt' })).not.toBeInTheDocument();
    });

    it('keeps expense summary cards global while expense search changes the table', async () => {
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Expenses' }));
        await waitFor(() => {
            expect(screen.getByText('Materials')).toBeInTheDocument();
            expect(screen.getByText('Rent')).toBeInTheDocument();
        });

        const totalExpensesCard = screen.getByText('Total Expenses').closest('.interactive-card') as HTMLElement;
        const expenseRecordsCard = screen.getByText('Expense Records').closest('.interactive-card') as HTMLElement;

        expect(normalizeText(totalExpensesCard.textContent)).toContain('450 000 UZS / 1,200 USD');
        expect(normalizeText(expenseRecordsCard.textContent)).toContain('2');

        fireEvent.change(screen.getByPlaceholderText('Search expenses by title...'), {
            target: { value: 'Materials' },
        });

        await waitFor(() => {
            expect(screen.getByText('Materials')).toBeInTheDocument();
            expect(screen.queryByText('Rent')).not.toBeInTheDocument();
        });

        expect(normalizeText(totalExpensesCard.textContent)).toContain('450 000 UZS / 1,200 USD');
        expect(normalizeText(expenseRecordsCard.textContent)).toContain('2');
        expect(listPaymentExpenses).toHaveBeenCalledWith({
            page: 1,
            perPage: 1,
        });
    });

    it('exports filtered expenses as a PDF', async () => {
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Expenses' }));
        await waitFor(() => {
            expect(screen.getByText('Materials')).toBeInTheDocument();
        });

        fireEvent.change(screen.getByPlaceholderText('Search expenses by title...'), {
            target: { value: 'Materials' },
        });
        await waitFor(() => {
            expect(screen.getByText('Materials')).toBeInTheDocument();
            expect(screen.queryByText('Rent')).not.toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));

        await waitFor(() => {
            expect(exportRowsToPdf).toHaveBeenCalledTimes(1);
        });
        expect(listPaymentExpenses).toHaveBeenCalledWith(expect.objectContaining({
            page: 1,
            perPage: 100,
            filter: expect.objectContaining({ search: 'Materials' }),
        }));
        expect(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0]).toMatchObject({
            filename: 'expenses.pdf',
            title: 'Clinic Expenses',
            columns: ['Date', 'Expense', 'Quantity', 'Amount'],
            orientation: 'portrait',
            locale: 'en',
        });
        expect(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].rows).toHaveLength(1);
        expect(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].rows[0]?.[1]).toBe('Materials');
        expect(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].rows[0]?.[2]).toBe('2');
        expect(normalizeText(String(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].rows[0]?.[3]))).toBe('450 000 UZS');
    });

    it('creates a payment expense from the expenses tab', async () => {
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Expenses' }));
        fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Rent' } });
        const amountInput = screen.getByLabelText('Amount');
        fireEvent.change(amountInput, { target: { value: '1200000' } });
        expect(amountInput).toHaveValue('1 200 000');
        fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-06-27' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));

        await waitFor(() => {
            expect(createPaymentExpense).toHaveBeenCalled();
        });
        expect(vi.mocked(createPaymentExpense).mock.calls[0]?.[0]).toEqual({
            title: 'Rent',
            amount: 1200000,
            quantity: 2,
            currency: 'UZS',
            expense_date: '2026-06-27',
        });
    });

    it('edits and deletes payment expenses from the expenses tab', async () => {
        const user = userEvent.setup();
        renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Expenses' }));

        await waitFor(() => {
            expect(screen.getByText('Materials')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'Edit expense Materials' }));
        expect(screen.getByLabelText('Title')).toHaveValue('Materials');
        expect(screen.getByLabelText('Quantity')).toHaveValue('2');

        await user.click(screen.getByRole('combobox', { name: 'Currency' }));
        await user.click(await screen.findByRole('option', { name: 'USD' }));
        fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '125.5' } });
        fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } });
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-06-27' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(updatePaymentExpense).toHaveBeenCalled();
        });
        expect(vi.mocked(updatePaymentExpense).mock.calls[0]?.[0]).toBe('expense-1');
        expect(vi.mocked(updatePaymentExpense).mock.calls[0]?.[1]).toEqual({
            title: 'Materials',
            amount: 125.5,
            quantity: 3,
            currency: 'USD',
            expense_date: '2026-06-27',
        });

        fireEvent.click(screen.getByRole('button', { name: 'Delete expense Materials' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => {
            expect(deletePaymentExpense).toHaveBeenCalled();
        });
        expect(vi.mocked(deletePaymentExpense).mock.calls[0]?.[0]).toBe('expense-1');
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
        expect(window.location.search).toContain('outstanding=1');

        fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));

        await waitFor(() => {
            expect(exportRowsToPdf).toHaveBeenCalledTimes(1);
        });
        expect(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].rows).toHaveLength(1);
        expect(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].rows[0]?.[0]).toBe('Jane Doe');
        expect(normalizeText(String(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].rows[0]?.[5]))).toBe('50 000 UZS (Debt)');
        expect(vi.mocked(exportRowsToPdf).mock.calls[0]?.[0].locale).toBe('en');
    });
});
