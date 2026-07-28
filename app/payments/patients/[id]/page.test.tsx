import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import PaymentPatientPage from '@/app/payments/patients/[id]/page';
import { I18nProvider } from '@/components/providers/i18n-provider';
import {
    getCurrentUser,
    getPatient,
    listPaymentLedgerHistory,
    listPaymentLedgerPatients,
} from '@/lib/api/dentist';
import { exportPatientReportToPdf } from '@/lib/export/pdf';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const routerMocks = vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => routerMocks,
}));

vi.mock('@/lib/api/dentist', () => ({
    archivePatient: vi.fn(),
    getCurrentUser: vi.fn(),
    getPatient: vi.fn(),
    listPaymentLedgerHistory: vi.fn(),
    listPaymentLedgerPatients: vi.fn(),
    permanentlyDeletePatient: vi.fn(),
    restorePatient: vi.fn(),
}));

vi.mock('@/lib/export/pdf', () => ({
    buildPdfFilename: vi.fn((prefix: string) => `${prefix}.pdf`),
    exportPatientReportToPdf: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const dentist = {
    id: '1',
    name: 'Demo Dentist',
    email: 'dentist@identa.test',
    role: 'dentist' as const,
    account_status: 'active' as const,
    subscription: {
        can_export: true,
    },
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
        patient_address: '12 Amir Temur Avenue, Tashkent',
        patient_date_of_birth: '1992-04-15',
        patient_photo_scan_status: 'approved',
        patient_photo_url: 'https://api.identa.test/api/v1/patients/p-1/photo',
        patient_photo_thumbnail_url: 'https://api.identa.test/api/v1/patients/p-1/photo?variant=thumbnail',
        patient_photo_preview_url: 'https://api.identa.test/api/v1/patients/p-1/photo?variant=preview',
        patient_photo_thumbnail_ready: true,
        patient_photo_preview_ready: true,
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

const fullPatientResponse = {
    id: 'p-1',
    patient_id: 'PT-0001',
    full_name: 'John Smith',
    phone: '+998 90 123 45 67',
    secondary_phone: '+998 91 765 43 21',
    address: '12 Amir Temur Avenue, Tashkent',
    date_of_birth: '1992-04-15',
    medical_history: null,
    allergies: null,
    current_medications: null,
    categories: [],
    photo_scan_status: 'approved',
    photo_url: 'https://api.identa.test/api/v1/patients/p-1/photo',
    photo_thumbnail_url: 'https://api.identa.test/api/v1/patients/p-1/photo?variant=thumbnail',
    photo_preview_url: 'https://api.identa.test/api/v1/patients/p-1/photo?variant=preview',
    photo_thumbnail_ready: true,
    photo_preview_ready: true,
    last_visit_at: '2026-07-20',
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
        routerMocks.push.mockReset();
        routerMocks.replace.mockReset();
        routerMocks.back.mockReset();
        routerMocks.refresh.mockReset();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getPatient).mockReset();
        vi.mocked(listPaymentLedgerPatients).mockReset();
        vi.mocked(listPaymentLedgerHistory).mockReset();
        vi.mocked(exportPatientReportToPdf).mockReset();
        vi.mocked(listPaymentLedgerPatients).mockResolvedValue(patientResponse as never);
        vi.mocked(listPaymentLedgerHistory).mockResolvedValue(historyResponse as never);
        vi.mocked(getPatient).mockResolvedValue(fullPatientResponse as never);
    });

    afterEach(() => {
        cleanup();
    });

    it('shows patient basics followed by the payment-focused work table', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);

        await renderPage();

        expect(await screen.findByRole('heading', { name: 'John Smith' })).toBeInTheDocument();
        const identity = screen.getByTestId('patient-detail-header-identity');
        const header = identity.parentElement;
        expect(header).not.toBeNull();
        expect(within(header as HTMLElement).queryByText('PT-0001')).not.toBeInTheDocument();
        expect(within(header as HTMLElement).getByRole('button', { name: 'Patient Photo: John Smith' }))
            .toHaveClass('h-24', 'w-24');
        expect(within(header as HTMLElement).getByText('+998 90 123 45 67')).toBeInTheDocument();
        expect(within(header as HTMLElement).getByText('+998 91 765 43 21')).toBeInTheDocument();
        expect(within(header as HTMLElement).getByText('Apr 15, 1992')).toBeInTheDocument();
        expect(within(header as HTMLElement).getByText('12 Amir Temur Avenue, Tashkent')).toBeInTheDocument();
        expect(header).toHaveClass('gap-2.5');
        expect(identity).toHaveClass('max-w-[20rem]');
        expect(screen.getByTestId('patient-detail-header-facts')).toHaveClass(
            'h-auto',
            'overflow-visible',
            'md:h-[8rem]',
            'md:overflow-hidden'
        );
        expect(within(header as HTMLElement).getByRole('button', { name: 'Schedule Appointment' }))
            .toHaveClass('size-10');
        expect(within(header as HTMLElement).getByRole('button', { name: 'Edit Patient' }))
            .toHaveClass('size-10');
        expect(within(header as HTMLElement).getByRole('button', { name: 'Archive' }))
            .toHaveClass('size-10');
        expect(within(header as HTMLElement).getByTestId('patient-detail-header-medical-empty'))
            .toHaveTextContent('No medical information recorded');

        const summaryGrid = screen.getByTestId('payment-summary-grid');
        const ledgerHeader = screen.getByTestId('payment-ledger-header');
        const workSummary = within(summaryGrid).getByTestId('payment-summary-totalDebt');
        const paidSummary = within(summaryGrid).getByTestId('payment-summary-totalPaid');
        const balanceSummary = within(summaryGrid).getByTestId('payment-summary-balance');
        expect(within(ledgerHeader).getByRole('heading', { name: 'Work payments' })).toBeInTheDocument();
        expect(ledgerHeader).toContainElement(summaryGrid);
        expect(ledgerHeader).toHaveClass(
            'xl:grid',
            'xl:grid-cols-[minmax(0,1fr)_minmax(0,38.22rem)_minmax(0,1fr)]',
            'xl:items-center'
        );
        expect(summaryGrid).toHaveClass(
            'flex-1',
            'gap-2',
            'md:grid-cols-3',
            'xl:col-start-2',
            'xl:w-full',
            'xl:max-w-[38.22rem]'
        );
        expect(workSummary).toHaveClass(
            'min-h-10',
            'rounded-xl',
            'px-3',
            'py-1.5',
            'border-red-100',
            'bg-red-50/45'
        );
        expect(paidSummary).toHaveClass(
            'min-h-10',
            'rounded-xl',
            'px-3',
            'py-1.5',
            'border-emerald-100',
            'bg-emerald-50/45'
        );
        expect(balanceSummary).toHaveClass('min-h-10', 'rounded-xl', 'px-3', 'py-1.5');
        expect(workSummary.querySelector('svg')).not.toBeInTheDocument();
        expect(paidSummary.querySelector('svg')).not.toBeInTheDocument();
        expect(balanceSummary.querySelector('svg')).not.toBeInTheDocument();

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
            expect(vi.mocked(getPatient)).toHaveBeenCalledWith('p-1');
        });
    });

    it('exports the complete patient payment ledger with profile and summary data', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);

        await renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }));

        await waitFor(() => {
            expect(exportPatientReportToPdf).toHaveBeenCalledTimes(1);
        });
        expect(listPaymentLedgerHistory).toHaveBeenCalledWith({
            page: 1,
            perPage: 100,
            filter: { patient_id: 'p-1' },
        });
        expect(vi.mocked(exportPatientReportToPdf).mock.calls[0]?.[0]).toMatchObject({
            filename: 'patient-payments.pdf',
            title: 'Patient payments',
            patientName: 'John Smith',
            patientMeta: [
                'Phone 1: +998 90 123 45 67',
                'Phone 2: +998 91 765 43 21',
                'Address: 12 Amir Temur Avenue, Tashkent',
            ],
            orientation: 'landscape',
        });
        expect(vi.mocked(exportPatientReportToPdf).mock.calls[0]?.[0].sections[0]?.table?.rows).toHaveLength(2);
    });

    it('allows a payments-only assistant without patient-history permission', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(paymentsAssistant as never);

        await renderPage();

        expect(await screen.findByRole('heading', { name: 'John Smith' })).toBeInTheDocument();
        expect(screen.getByRole('table')).toBeInTheDocument();
        expect(vi.mocked(getPatient)).not.toHaveBeenCalled();
    });

    it('denies a user without payments permission before loading ledger data', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(noAccessAssistant as never);

        await renderPage();

        expect(await screen.findByText('Ask your account owner for access.')).toBeInTheDocument();
        expect(vi.mocked(listPaymentLedgerPatients)).not.toHaveBeenCalled();
        expect(vi.mocked(listPaymentLedgerHistory)).not.toHaveBeenCalled();
    });
});
