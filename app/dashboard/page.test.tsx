import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/dashboard/page';
import { getCurrentUser, getDashboardSnapshot } from '@/lib/api/dentist';

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    getDashboardSnapshot: vi.fn(),
}));

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
            <DashboardPage />
        </QueryClientProvider>
    );
}

describe('DashboardPage', () => {
    beforeEach(() => {
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getDashboardSnapshot).mockReset();

        vi.mocked(getCurrentUser).mockResolvedValue({
            id: 1,
            name: 'Demo Dentist',
            email: 'dentist@identa.test',
            role: 'dentist',
        });
    });

    afterEach(() => {
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
