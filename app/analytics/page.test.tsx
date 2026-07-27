import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsPage from '@/app/analytics/page';
import {
    getAnalyticsSummary,
    getCurrentUser,
} from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import type { ApiAnalyticsSummary } from '@/lib/api/types';
import { formatCurrency } from '@/lib/utils';

vi.mock('@/lib/api/dentist', () => ({
    getAnalyticsSummary: vi.fn(),
    getCurrentUser: vi.fn(),
}));

const dentist = {
    id: '1',
    name: 'Demo Dentist',
    email: 'dentist@identa.test',
    role: 'dentist' as const,
    account_status: 'active' as const,
};

const assistantNoAccess = {
    id: '2',
    name: 'Assistant',
    email: 'assistant@identa.test',
    role: 'assistant' as const,
    account_status: 'active' as const,
    permissions: [],
};

function createAnalyticsSummary(overrides: Partial<ApiAnalyticsSummary> = {}): ApiAnalyticsSummary {
    return {
        currency: 'UZS',
        permissions: { payments: true, patients: true, appointments: true },
        kpis: {
            revenue: { current: 0, previous: 0 },
            debt: { current: 0, previous: null },
            patients: { current: 0, previous: 0 },
            visits: { current: 0, previous: 0 },
        },
        buckets: [],
        appointment_status: [
            { status: 'scheduled', count: 0 },
            { status: 'completed', count: 0 },
            { status: 'cancelled', count: 0 },
            { status: 'no_show', count: 0 },
        ],
        top_debtors: [],
        ...overrides,
    };
}

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <AnalyticsPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

function normalizeVisibleText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

describe('AnalyticsPage', () => {
    beforeEach(() => {
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getAnalyticsSummary).mockReset();
        vi.mocked(getAnalyticsSummary).mockResolvedValue(createAnalyticsSummary());
    });

    afterEach(() => {
        cleanup();
    });

    it('shows an error state when the session fails to load', async () => {
        vi.mocked(getCurrentUser).mockRejectedValue(new Error('boom'));
        renderPage();
        expect(await screen.findByText('Could not load data')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('denies access to an assistant with no view permissions', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(assistantNoAccess as never);
        renderPage();
        // permissions.deniedDescription (EN) = "Ask your account owner for access."
        expect(await screen.findByText('Ask your account owner for access.')).toBeInTheDocument();
    });

    it('renders the analytics dashboard for a dentist', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        renderPage();
        // analytics.subtitle (EN) = "Financial metrics, activity and trends for your clinic."
        expect(
            await screen.findByText('Financial metrics, activity and trends for your clinic.')
        ).toBeInTheDocument();
        const rangeSelector = screen.getByRole('radiogroup');
        expect(rangeSelector).toHaveClass('max-w-full', 'overflow-x-auto');
        expect(within(rangeSelector).getAllByRole('radio')[0]).toHaveClass('shrink-0');
        expect(vi.mocked(getAnalyticsSummary)).toHaveBeenCalledWith(expect.objectContaining({
            current_from: expect.any(String),
            current_to: expect.any(String),
            previous_from: expect.any(String),
            previous_to: expect.any(String),
            currency: 'UZS',
        }));
    });

    it('switches financial analytics between UZS and USD without mixing values', async () => {
        const user = userEvent.setup();
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getAnalyticsSummary).mockImplementation(async (params) => {
            const selectedCurrency = params.currency ?? 'UZS';
            const isUsd = selectedCurrency === 'USD';

            return createAnalyticsSummary({
                currency: selectedCurrency,
                kpis: {
                    revenue: { current: isUsd ? 40 : 40_000, previous: isUsd ? 20 : 20_000 },
                    debt: { current: isUsd ? 60 : 60_000, previous: null },
                    patients: { current: 2, previous: 1 },
                    visits: { current: 3, previous: 2 },
                },
                top_debtors: [
                    {
                        name: isUsd ? 'USD Patient' : 'UZS Patient',
                        phone: '+998900000001',
                        debt: isUsd ? 60 : 60_000,
                    },
                ],
            });
        });

        renderPage();

        const uzsRevenue = formatCurrency(40_000, 'UZS');
        expect(await screen.findByText((content) => (
            normalizeVisibleText(content) === normalizeVisibleText(uzsRevenue)
        ))).toBeInTheDocument();
        const uzsButton = screen.getByRole('button', { name: 'UZS' });
        const usdButton = screen.getByRole('button', { name: 'USD' });
        expect(uzsButton).toHaveAttribute('aria-pressed', 'true');
        expect(usdButton).toHaveAttribute('aria-pressed', 'false');
        await user.click(usdButton);

        await waitFor(() => {
            expect(vi.mocked(getAnalyticsSummary)).toHaveBeenLastCalledWith(expect.objectContaining({
                currency: 'USD',
            }));
        });
        expect(screen.getByRole('button', { name: 'UZS' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: 'USD' })).toHaveAttribute('aria-pressed', 'true');
        const usdRevenue = formatCurrency(40, 'USD');
        expect(await screen.findByText((content) => (
            normalizeVisibleText(content) === normalizeVisibleText(usdRevenue)
        ))).toBeInTheDocument();
        expect(await screen.findByText('USD Patient')).toBeInTheDocument();
        expect(screen.queryByText('UZS Patient')).not.toBeInTheDocument();
        const usdDebt = formatCurrency(60, 'USD');
        expect((await screen.findAllByText((content) => (
            normalizeVisibleText(content) === normalizeVisibleText(usdDebt)
        ))).length).toBeGreaterThanOrEqual(2);
    });

    it('renders visit totals from the backend summary', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getAnalyticsSummary).mockResolvedValue(createAnalyticsSummary({
            kpis: {
                revenue: { current: 0, previous: 0 },
                debt: { current: 0, previous: null },
                patients: { current: 0, previous: 0 },
                visits: { current: 2, previous: 0 },
            },
        }));

        renderPage();

        const label = await screen.findByText('Visits');
        const card = label.closest('div.relative');
        expect(card).not.toBeNull();
        expect(within(card as HTMLElement).getByText('2')).toBeInTheDocument();
    });

    it('shows PDF export only when the active subscription grants exports', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
            ...dentist,
            subscription: { can_export: false },
        } as never);
        const rendered = renderPage();
        await screen.findByText('Analytics');
        expect(screen.queryByRole('button', { name: 'Export PDF' })).not.toBeInTheDocument();

        rendered.unmount();
        vi.mocked(getCurrentUser).mockResolvedValue({
            ...dentist,
            subscription: { can_export: true },
        } as never);
        renderPage();
        expect(await screen.findByRole('button', { name: 'Export PDF' })).toBeInTheDocument();
    });

    it('shows only the top four debtors with a link to all outstanding payments', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getAnalyticsSummary).mockResolvedValue(createAnalyticsSummary({
            top_debtors: [
                { name: 'Patient 1', phone: '+998900000001', debt: 1_000_000 },
                { name: 'Patient 2', phone: '+998900000002', debt: 500_000 },
                { name: 'Patient 3', phone: '+998900000003', debt: 400_000 },
                { name: 'Patient 4', phone: '+998900000004', debt: 300_000 },
                { name: 'Patient 5', phone: '+998900000005', debt: 200_000 },
                { name: 'Patient 6', phone: '+998900000006', debt: 100_000 },
            ],
        }));

        renderPage();

        expect(await screen.findByText('Largest outstanding balances')).toBeInTheDocument();
        expect(screen.getByText('Patient 1')).toBeInTheDocument();
        expect(screen.getByText('Patient 4')).toBeInTheDocument();
        const topDebtSummary = `In top: ${formatCurrency(2_200_000)}`;
        expect(screen.getByText((content) => normalizeVisibleText(content) === normalizeVisibleText(topDebtSummary))).toBeInTheDocument();
        expect(screen.queryByText('Patient 5')).not.toBeInTheDocument();
        expect(screen.queryByText('Patient 6')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'All debts' })).toHaveAttribute('href', '/payments?outstanding=1');
    });
});
