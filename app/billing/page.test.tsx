import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BillingPage from '@/app/billing/page';
import {
    getCurrentUser,
    getCurrentSubscription,
    listBillingPlans,
    listBillingPayments,
    listAssistants,
} from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    getCurrentSubscription: vi.fn(),
    listBillingPlans: vi.fn(),
    listBillingPayments: vi.fn(),
    listAssistants: vi.fn(),
    createBillingCheckout: vi.fn(),
}));

const dentist = {
    id: '1',
    name: 'Demo Dentist',
    email: 'dentist@identa.test',
    role: 'dentist' as const,
    account_status: 'active' as const,
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
                <BillingPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('BillingPage', () => {
    beforeEach(() => {
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getCurrentSubscription).mockReset();
        vi.mocked(listBillingPlans).mockReset();
        vi.mocked(listBillingPayments).mockReset();
        vi.mocked(listAssistants).mockReset();

        vi.mocked(listBillingPayments).mockResolvedValue([]);
        vi.mocked(listAssistants).mockResolvedValue({ data: [] } as never);
    });

    afterEach(() => {
        cleanup();
    });

    it('shows an access-denied state for non-owner (assistant) accounts', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ ...dentist, role: 'assistant' } as never);
        vi.mocked(getCurrentSubscription).mockResolvedValue(null as never);
        vi.mocked(listBillingPlans).mockResolvedValue([]);

        renderPage();

        // common.forbiddenTitle (EN) = "No access"
        expect(await screen.findByText('No access')).toBeInTheDocument();
    });

    it('shows an error state with retry when billing data fails to load', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getCurrentSubscription).mockRejectedValue(new Error('boom'));
        vi.mocked(listBillingPlans).mockRejectedValue(new Error('boom'));

        renderPage();

        // common.loadErrorTitle (EN) = "Could not load data"
        expect(await screen.findByText('Could not load data')).toBeInTheDocument();
        // common.retry (EN) = "Retry"
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('renders the billing overview for an owner when data loads', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getCurrentSubscription).mockResolvedValue(null as never);
        vi.mocked(listBillingPlans).mockResolvedValue([]);

        renderPage();

        // The owner overview reached its payment-history card (empty mock) —
        // i.e. neither the access-denied nor the error state rendered.
        expect(await screen.findByText('No payments yet.')).toBeInTheDocument();
        expect(screen.queryByText('No access')).not.toBeInTheDocument();
        expect(screen.queryByText('Could not load data')).not.toBeInTheDocument();
    });
});
