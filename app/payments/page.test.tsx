import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentsPage from '@/app/payments/page';
import { getCurrentUser, getPatient, listAllTreatments } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    listAllTreatments: vi.fn(),
    getPatient: vi.fn(),
}));

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

describe('PaymentsPage', () => {
    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        vi.mocked(listAllTreatments).mockReset();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getPatient).mockReset();

        vi.mocked(getCurrentUser).mockResolvedValue({
            id: 'user-1',
            name: 'Dr. Test',
            email: 'doctor@example.test',
            role: 'dentist',
            account_status: 'active',
        });
        vi.mocked(listAllTreatments).mockResolvedValue([
            {
                id: 'tr-1',
                patient_id: 'patient-1',
                patient_name: 'Jane Doe',
                patient_phone: '+998900000001',
                patient_code: 'PT-1001',
                tooth_number: 12,
                teeth: [12],
                treatment_type: 'Composite filling',
                description: null,
                comment: 'Upper left premolar',
                treatment_date: '2026-03-14',
                cost: null,
                debt_amount: 120000,
                paid_amount: 70000,
                balance: 50000,
                notes: null,
                images: [],
                created_at: '2026-03-14T09:00:00Z',
                updated_at: '2026-03-14T09:00:00Z',
            },
            {
                id: 'tr-2',
                patient_id: 'patient-2',
                patient_name: 'John Smith',
                patient_phone: '+998900000002',
                patient_code: 'PT-1002',
                tooth_number: null,
                teeth: [],
                treatment_type: 'Teeth cleaning',
                description: null,
                comment: null,
                treatment_date: '2026-03-10',
                cost: null,
                debt_amount: 50000,
                paid_amount: 50000,
                balance: 0,
                notes: null,
                images: [],
                created_at: '2026-03-10T10:00:00Z',
                updated_at: '2026-03-10T10:00:00Z',
            },
        ] as never);
    });

    it('renders patient balances and links to patient history page', async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Jane Doe')).toBeInTheDocument();
            expect(screen.getByText('John Smith')).toBeInTheDocument();
        });

        expect(screen.getByText('Total Debt')).toBeInTheDocument();
        expect(screen.getByText('Total Paid')).toBeInTheDocument();
        expect(
            screen.getByText((_, element) => normalizeText(element?.textContent) === '170 000 UZS')
        ).toBeInTheDocument();
        expect(
            screen.getAllByText((_, element) => normalizeText(element?.textContent) === '120 000 UZS').length
        ).toBeGreaterThan(0);

        const janeRow = screen.getByText('Jane Doe').closest('tr');
        expect(janeRow).not.toBeNull();

        const historyLink = within(janeRow as HTMLElement).getByRole('link', { name: 'History' });
        expect(historyLink).toHaveAttribute('href', '/patients/patient-1/history?from=payments');
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
    });
});
