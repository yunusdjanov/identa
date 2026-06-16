import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPaymentsPage from '@/app/admin/payments/page';
import { getCurrentUser, listAdminPayments, refundAdminPayment } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn() }),
}));

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    listAdminPayments: vi.fn(),
    refundAdminPayment: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const admin = {
    id: 'admin-1',
    name: 'Super Admin',
    email: 'admin@identa.test',
    role: 'admin' as const,
    account_status: 'active' as const,
};

const paymentRow = {
    id: 'p-1',
    dentist: { id: 'd-1', name: 'Dr Demo', email: 'clinic@demo.test' },
    amount: 450000,
    currency: 'UZS',
    status: 'paid',
    plan: 'pro',
    billing_period: 'monthly',
    created_at: '2026-06-01T10:00:00Z',
};

function paymentsResponse(rows: Array<typeof paymentRow>) {
    return {
        data: rows,
        meta: {
            pagination: { current_page: 1, total_pages: 1, total: rows.length, per_page: 20 },
            summary: {
                this_month: 450000,
                this_year: 1200000,
                all_time: 5000000,
                currency: 'UZS',
                paid_count: rows.length,
            },
        },
    };
}

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
                <AdminPaymentsPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('AdminPaymentsPage', () => {
    beforeEach(() => {
        replaceMock.mockClear();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(listAdminPayments).mockReset();
    });

    afterEach(() => {
        cleanup();
    });

    it('redirects non-admin users away from the payments console', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ ...admin, role: 'dentist' } as never);
        renderPage();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    });

    it('redirects to the admin login when the admin session is invalid', async () => {
        vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthenticated'));
        renderPage();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/admin/login'));
    });

    it('shows an error state with retry when payments fail to load', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        vi.mocked(listAdminPayments).mockRejectedValue(new Error('boom'));
        renderPage();

        // common.loadErrorTitle (EN) = "Could not load data"
        expect(await screen.findByText('Could not load data')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('renders the payment ledger and summary for an admin', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        vi.mocked(listAdminPayments).mockResolvedValue(paymentsResponse([paymentRow]) as never);
        renderPage();

        // dentist email renders as its own text node in the ledger row
        expect(await screen.findByText('clinic@demo.test')).toBeInTheDocument();
        // admin.payments.thisMonth (EN) = "This month"
        expect(screen.getByText('This month')).toBeInTheDocument();
    });

    it('refunds a paid payment through the confirm dialog', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        vi.mocked(listAdminPayments).mockResolvedValue(paymentsResponse([paymentRow]) as never);
        renderPage();
        const user = userEvent.setup();

        // Open the refund confirmation from the paid row's action button.
        await user.click(await screen.findByRole('button', { name: 'Refund' }));

        // Confirm inside the dialog (a second "Refund"-labelled button).
        const dialog = await screen.findByRole('dialog');
        await user.click(within(dialog).getByRole('button', { name: 'Refund' }));

        expect(refundAdminPayment).toHaveBeenCalledWith('p-1');
    });
});
