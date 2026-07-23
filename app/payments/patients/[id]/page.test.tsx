import { Suspense } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PaymentPatientPage from '@/app/payments/patients/[id]/page';
import { I18nProvider } from '@/components/providers/i18n-provider';
import {
    getCurrentUser,
    listPaymentLedgerHistory,
    listPaymentLedgerPatients,
} from '@/lib/api/dentist';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    listPaymentLedgerHistory: vi.fn(),
    listPaymentLedgerPatients: vi.fn(),
}));

const dentist = {
    id: '1',
    name: 'Demo Dentist',
    email: 'dentist@identa.test',
    role: 'dentist' as const,
    account_status: 'active' as const,
};

const paymentsAssistant = {
    id: '2',
    name: 'Payments Assistant',
    email: 'payments@identa.test',
    role: 'assistant' as const,
    account_status: 'active' as const,
    assistant_permissions: ['payments.view'],
};

const noAccessAssistant = {
    ...paymentsAssistant,
    assistant_permissions: [],
};

const patientResponse = {
    data: [{
        patient_id: 'p-1',
        patient_code: 'PT-0001',
        patient_name: 'John Smith',
        patient_phone: '+998 90 123 45 67',
        patient_secondary_phone: '+998 91 765 43 21',
        total_debt: 1_000_000,
        total_paid: 400_000,
        balance: 600_000,
        balances_by_currency: {
            UZS: { total_debt: 1_000_000, total_paid: 400_000, balance: 600_000 },
        },
        entry_count: 2,
        last_entry_date: '2026-07-20',
    }],
    meta: {
        pagination: { page: 1, per_page: 1, total: 1, total_pages: 1 },
    },
};

const historyResponse = {
    data: [
        {
            id: 't-1',
            patient_id: 'p-1',
            date: '2026-07-20',
            teeth: [],
            work_done: 'Implant crown',
            comment: 'Clinical detail that should not become a table column',
            debt: 1_000_000,
            paid: 400_000,
            balance_delta: 600_000,
            currency: 'UZS',
        },
        {
            id: 't-2',
            patient_id: 'p-1',
            date: '2026-07-18',
            teeth: [12],
            work_done: 'Consultation',
            comment: null,
            debt: 50,
            paid: 50,
            balance_delta: 0,
            currency: 'USD',
        },
    ],
    meta: {
        pagination: { page: 1, per_page: 10, total: 2, total_pages: 1 },
    },
};

async function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    await act(async () => {
        render(
            <QueryClientProvider client={queryClient}>
                <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                    <Suspense fallback={<div>loading</div>}>
                        <PaymentPatientPage params={Promise.resolve({ id: 'p-1' })} />
                    </Suspense>
                </I18nProvider>
            </QueryClientProvider>
        );
    });
}

describe('PaymentPatientPage', () => {
    beforeEach(() => {
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(listPaymentLedgerPatients).mockReset();
        vi.mocked(listPaymentLedgerHistory).mockReset();
        vi.mocked(listPaymentLedgerPatients).mockResolvedValue(patientResponse as never);
        vi.mocked(listPaymentLedgerHistory).mockResolvedValue(historyResponse as never);
    });

    afterEach(() => {
        cleanup();
    });

    it('shows patient basics followed by the payment-focused work table', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);

        await renderPage();

        expect(await screen.findByRole('heading', { name: 'John Smith' })).toBeInTheDocument();
        const basicInfo = screen.getByTestId('payment-patient-basic-info');
        expect(within(basicInfo).getByText('PT-0001')).toBeInTheDocument();
        expect(within(basicInfo).getByText('+998 90 123 45 67')).toBeInTheDocument();
        expect(within(basicInfo).getByText('+998 91 765 43 21')).toBeInTheDocument();

        const table = screen.getByRole('table');
        expect(within(table).getByRole('columnheader', { name: 'Date' })).toBeInTheDocument();
        expect(within(table).getByRole('columnheader', { name: 'Work title' })).toBeInTheDocument();
        expect(within(table).getByRole('columnheader', { name: 'Price' })).toBeInTheDocument();
        expect(within(table).getByRole('columnheader', { name: 'Paid' })).toBeInTheDocument();
        expect(within(table).getByRole('columnheader', { name: 'Debt' })).toBeInTheDocument();
        expect(within(table).getByText('Implant crown')).toBeInTheDocument();
        expect(within(table).getByText('Consultation')).toBeInTheDocument();
        expect(screen.queryByText('Clinical detail that should not become a table column')).not.toBeInTheDocument();
        expect(screen.queryByText('Primary log of completed work and payments for this patient.')).not.toBeInTheDocument();

        await waitFor(() => {
            expect(vi.mocked(listPaymentLedgerPatients)).toHaveBeenCalledWith(expect.objectContaining({
                filter: { patient_id: 'p-1' },
            }));
            expect(vi.mocked(listPaymentLedgerHistory)).toHaveBeenCalledWith(expect.objectContaining({
                filter: { patient_id: 'p-1' },
            }));
        });
    });

    it('allows a payments-only assistant without patient-history permission', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(paymentsAssistant as never);

        await renderPage();

        expect(await screen.findByRole('heading', { name: 'John Smith' })).toBeInTheDocument();
        expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('denies a user without payments permission before loading ledger data', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(noAccessAssistant as never);

        await renderPage();

        expect(await screen.findByText('Ask your account owner for access.')).toBeInTheDocument();
        expect(vi.mocked(listPaymentLedgerPatients)).not.toHaveBeenCalled();
        expect(vi.mocked(listPaymentLedgerHistory)).not.toHaveBeenCalled();
    });
});
