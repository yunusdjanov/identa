import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAnalyticsPage from '@/app/admin/analytics/page';
import { getAdminAnalyticsSummary, getCurrentUser } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import type { ApiAdminAnalyticsSummary } from '@/lib/api/types';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn() }),
}));
vi.mock('@/lib/api/dentist', () => ({
    getAdminAnalyticsSummary: vi.fn(),
    getCurrentUser: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const admin = { id: 'a1', name: 'Super Admin', email: 'admin@identa.test', role: 'admin' as const, account_status: 'active' as const };

function createAdminAnalyticsSummary(): ApiAdminAnalyticsSummary {
    return {
        kpis: {
            active_dentists: { current: 0, previous: 0 },
            mrr: { current: 0, previous: 0, currency: 'UZS' },
            signups: { current: 0, previous: 0 },
            conversion: { current: 0, previous: 0 },
        },
        signup_growth: [],
        subscription_health: [
            { status: 'active', count: 0 },
            { status: 'trialing', count: 0 },
            { status: 'grace', count: 0 },
            { status: 'read_only', count: 0 },
            { status: 'canceled', count: 0 },
            { status: 'none', count: 0 },
        ],
    };
}

function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <AdminAnalyticsPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('AdminAnalyticsPage', () => {
    beforeEach(() => {
        replaceMock.mockClear();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getAdminAnalyticsSummary).mockReset();
        vi.mocked(getAdminAnalyticsSummary).mockResolvedValue(createAdminAnalyticsSummary());
    });
    afterEach(() => cleanup());

    it('redirects non-admin users away from admin analytics', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ ...admin, role: 'dentist' } as never);
        renderPage();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    });

    it('redirects to the admin login when the session is invalid', async () => {
        vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthenticated'));
        renderPage();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/admin/login'));
    });

    it('renders admin analytics for an admin', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        renderPage();
        // admin.analyticsSubtitle (EN) is unique to this page
        expect(
            await screen.findByText('Subscription health, revenue, and dentist base growth')
        ).toBeInTheDocument();
        expect(vi.mocked(getAdminAnalyticsSummary)).toHaveBeenCalledWith(expect.objectContaining({
            current_from: expect.any(String),
            current_to: expect.any(String),
            previous_from: expect.any(String),
            previous_to: expect.any(String),
        }));
    });
});
