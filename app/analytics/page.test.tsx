import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsPage from '@/app/analytics/page';
import {
    getCurrentUser,
    getDashboardSnapshot,
    listAllAppointments,
    listAllTreatments,
    listPatients,
} from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    getDashboardSnapshot: vi.fn(),
    listAllAppointments: vi.fn(),
    listAllTreatments: vi.fn(),
    listPatients: vi.fn(),
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

describe('AnalyticsPage', () => {
    beforeEach(() => {
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getDashboardSnapshot).mockResolvedValue({} as never);
        vi.mocked(listAllAppointments).mockResolvedValue([] as never);
        vi.mocked(listAllTreatments).mockResolvedValue([] as never);
        vi.mocked(listPatients).mockResolvedValue({ data: [] } as never);
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
        expect(vi.mocked(listAllTreatments)).toHaveBeenCalledWith(expect.objectContaining({
            filter: expect.objectContaining({
                date_from: expect.any(String),
                date_to: expect.any(String),
            }),
            includeImages: false,
        }));
        expect(vi.mocked(listAllAppointments)).toHaveBeenCalledWith(expect.objectContaining({
            filter: expect.objectContaining({
                date_from: expect.any(String),
                date_to: expect.any(String),
            }),
        }));
    });
});
