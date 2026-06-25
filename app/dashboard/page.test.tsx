import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/dashboard/page';
import { getCurrentUser, getDashboardSnapshot } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    getDashboardSnapshot: vi.fn(),
}));

const DASHBOARD_FINANCIAL_PRIVACY_STORAGE_KEY = 'identa.dashboard.financialPrivacy.v1';

function timeOffsetFromNow(minutes: number): string {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const clampedMinutes = Math.max(0, Math.min(23 * 60 + 59, nowMinutes + minutes));
    const hours = Math.floor(clampedMinutes / 60);
    const mins = clampedMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
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
                <DashboardPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('DashboardPage', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getDashboardSnapshot).mockReset();

        vi.mocked(getCurrentUser).mockResolvedValue({
            // ApiUser fields the mock needs (id was numeric here previously;
            // account_status became required when soft-delete landed and the
            // mock wasn't updated).
            id: '1',
            name: 'Demo Dentist',
            email: 'dentist@identa.test',
            role: 'dentist',
            account_status: 'active',
        });
    });

    afterEach(() => {
        window.localStorage.clear();
        cleanup();
    });

    it('shows only 4 upcoming appointments and keeps show-all action', async () => {
        vi.mocked(getDashboardSnapshot).mockResolvedValue({
            revenueThisMonth: 1000000,
            outstandingDebtTotal: 500000,
            todayAppointments: [
                {
                    id: 'a-1',
                    patientName: 'Early One',
                    appointmentDate: '2026-03-01',
                    startTime: timeOffsetFromNow(-20),
                    durationMinutes: 30,
                    status: 'scheduled',
                    reason: 'Checkup',
                },
                {
                    id: 'a-3',
                    patientName: 'Upcoming One',
                    appointmentDate: '2026-03-01',
                    startTime: timeOffsetFromNow(10),
                    durationMinutes: 30,
                    status: 'scheduled',
                    reason: 'Cleaning',
                },
                {
                    id: 'a-4',
                    patientName: 'Upcoming Two',
                    appointmentDate: '2026-03-01',
                    startTime: timeOffsetFromNow(20),
                    durationMinutes: 30,
                    status: 'scheduled',
                    reason: 'Filling',
                },
                {
                    id: 'a-5',
                    patientName: 'Upcoming Three',
                    appointmentDate: '2026-03-01',
                    startTime: timeOffsetFromNow(30),
                    durationMinutes: 30,
                    status: 'scheduled',
                    reason: 'Review',
                },
                {
                    id: 'a-6',
                    patientName: 'Upcoming Four',
                    appointmentDate: '2026-03-01',
                    startTime: timeOffsetFromNow(40),
                    durationMinutes: 30,
                    status: 'scheduled',
                    reason: 'Follow up',
                },
            ],
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('Upcoming One')).toBeInTheDocument();
            expect(screen.getByText('Upcoming Two')).toBeInTheDocument();
            expect(screen.getByText('Upcoming Three')).toBeInTheDocument();
            expect(screen.getByText('Upcoming Four')).toBeInTheDocument();
        });

        expect(screen.queryByText('Early One')).not.toBeInTheDocument();
        expect(screen.queryByText('Early Two')).not.toBeInTheDocument();
        const showAllLink = screen.getByRole('link', { name: /(Show all today|Показать все на сегодня) \(5\)/i });
        expect(showAllLink).toHaveAttribute('href', '/appointments');
    });

    it('masks dashboard financial KPI amounts independently and remembers the choice', async () => {
        vi.mocked(getDashboardSnapshot).mockResolvedValue({
            revenueThisMonth: 1000000,
            outstandingDebtTotal: 500000,
            todayAppointments: [],
        });

        const firstRender = renderPage();

        const hideButtons = await screen.findAllByRole('button', { name: 'Hide amounts' });
        expect(screen.queryByText('***')).not.toBeInTheDocument();

        fireEvent.click(hideButtons[0]);

        expect(screen.getAllByText('***')).toHaveLength(1);
        expect(window.localStorage.getItem(DASHBOARD_FINANCIAL_PRIVACY_STORAGE_KEY)).toBe(JSON.stringify({
            revenueThisMonth: true,
            outstandingDebtTotal: false,
        }));

        fireEvent.click(screen.getAllByRole('button', { name: 'Hide amounts' })[0]);

        expect(screen.getAllByText('***')).toHaveLength(2);
        expect(window.localStorage.getItem(DASHBOARD_FINANCIAL_PRIVACY_STORAGE_KEY)).toBe(JSON.stringify({
            revenueThisMonth: true,
            outstandingDebtTotal: true,
        }));

        fireEvent.click(screen.getAllByRole('button', { name: 'Show amounts' })[0]);

        expect(screen.getAllByText('***')).toHaveLength(1);
        expect(window.localStorage.getItem(DASHBOARD_FINANCIAL_PRIVACY_STORAGE_KEY)).toBe(JSON.stringify({
            revenueThisMonth: false,
            outstandingDebtTotal: true,
        }));

        firstRender.unmount();
        renderPage();

        expect(await screen.findByText('***')).toBeInTheDocument();
        expect(screen.getAllByRole('button', { name: 'Hide amounts' })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: 'Show amounts' })).toHaveLength(1);
    });

    it('shows "no more upcoming" state when today items are all in the past', async () => {
        vi.mocked(getDashboardSnapshot).mockResolvedValue({
            revenueThisMonth: 1000000,
            outstandingDebtTotal: 500000,
            todayAppointments: [
                {
                    id: 'a-1',
                    patientName: 'Morning One',
                    appointmentDate: '2026-03-01',
                    startTime: timeOffsetFromNow(-30),
                    durationMinutes: 30,
                    status: 'scheduled',
                    reason: 'Checkup',
                },
                {
                    id: 'a-2',
                    patientName: 'Morning Two',
                    appointmentDate: '2026-03-01',
                    startTime: timeOffsetFromNow(-15),
                    durationMinutes: 30,
                    status: 'scheduled',
                    reason: 'Consult',
                },
            ],
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/(No more upcoming appointments for today\.|На сегодня больше нет ближайших записей\.)/i)).toBeInTheDocument();
        });

        const showAllLink = screen.getByRole('link', { name: /(Show all today|Показать все на сегодня) \(2\)/i });
        expect(showAllLink).toHaveAttribute('href', '/appointments');
    });
});
