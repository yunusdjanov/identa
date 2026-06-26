import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/dashboard/page';
import { getCurrentUser, getProfile, listAllAppointments, listAppointments, lookupPatients } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { toLocalDateKey } from '@/lib/utils';

vi.mock('@/lib/api/dentist', () => ({
    createAppointment: vi.fn(),
    getCurrentUser: vi.fn(),
    getProfile: vi.fn(),
    listAppointments: vi.fn(),
    listAllAppointments: vi.fn(),
    lookupPatients: vi.fn(),
    updateAppointment: vi.fn(),
}));

function timeOffsetFromNow(minutes: number): string {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const clampedMinutes = Math.max(0, Math.min(23 * 60 + 59, nowMinutes + minutes));
    const hours = Math.floor(clampedMinutes / 60);
    const mins = clampedMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function addDays(date: Date, days: number): Date {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + days);
    return nextDate;
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
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getProfile).mockReset();
        vi.mocked(listAllAppointments).mockReset();
        vi.mocked(listAppointments).mockReset();
        vi.mocked(lookupPatients).mockReset();

        vi.mocked(getCurrentUser).mockResolvedValue({
            id: '1',
            name: 'Demo Dentist',
            email: 'dentist@identa.test',
            role: 'dentist',
            account_status: 'active',
        });
        vi.mocked(getProfile).mockResolvedValue({
            id: 'profile-1',
            name: 'Demo Dentist',
            email: 'dentist@identa.test',
            phone: null,
            practice_name: 'Identa',
            license_number: null,
            address: null,
            working_hours: {
                start: '09:00',
                end: '18:00',
            },
            default_appointment_duration: 30,
            show_record_authors: false,
        });
        vi.mocked(listAppointments).mockResolvedValue({
            data: [],
            meta: {
                pagination: {
                    page: 1,
                    per_page: 20,
                    total: 0,
                    total_pages: 1,
                },
            },
        });
        vi.mocked(lookupPatients).mockResolvedValue({
            data: [],
            meta: {
                pagination: {
                    page: 1,
                    per_page: 20,
                    total: 0,
                    total_pages: 1,
                },
            },
        });
    });

    afterEach(() => {
        cleanup();
    });

    it('renders the planner dashboard with appointment stats instead of financial KPIs', async () => {
        const todayKey = toLocalDateKey(new Date());
        const tomorrowKey = toLocalDateKey(addDays(new Date(), 1));
        vi.mocked(listAllAppointments).mockResolvedValue([
            {
                id: 'a-1',
                patient_id: 'patient-1',
                patient_name: 'Alisher Karimov',
                appointment_date: todayKey,
                start_time: timeOffsetFromNow(30),
                end_time: timeOffsetFromNow(60),
                status: 'scheduled',
                notes: 'Cleaning',
            },
            {
                id: 'a-2',
                patient_id: null,
                guest_name: 'New Visitor',
                guest_phone: '+998901234567',
                is_guest: true,
                appointment_date: tomorrowKey,
                start_time: '12:00',
                end_time: '12:30',
                status: 'cancelled',
                notes: 'Consult',
            },
        ]);

        renderPage();

        expect(await screen.findByText('Work dashboard')).toBeInTheDocument();
        expect(screen.getByText('Total appointments')).toBeInTheDocument();
        expect(screen.getAllByText('Scheduled').length).toBeGreaterThan(0);
        expect(screen.getByText('Starting Soon')).toBeInTheDocument();
        expect(screen.queryByText('Collected This Month')).not.toBeInTheDocument();
        expect(screen.queryByText('Outstanding Debts')).not.toBeInTheDocument();
        expect(screen.getByText('Alisher Karimov')).toBeInTheDocument();
        expect(screen.getByText('New Visitor')).toBeInTheDocument();

        await waitFor(() => {
            expect(listAllAppointments).toHaveBeenCalledWith(expect.objectContaining({
                sort: 'appointment_date,start_time',
                filter: expect.objectContaining({
                    date_from: expect.any(String),
                    date_to: expect.any(String),
                }),
            }));
        });
    });

    it('switches between day and month planner views', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([]);

        renderPage();

        expect(await screen.findByText('Work dashboard')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Day$/i }));
        expect(screen.getByText('Day agenda')).toBeInTheDocument();
        expect(screen.getAllByText('Add')[0]).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /^Month$/i }));
        expect(screen.getByText('Planner')).toBeInTheDocument();
        expect(screen.getAllByText('No appointments').length).toBeGreaterThan(0);
    });

    it('shows access denied when appointments permission is missing', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
            id: '2',
            name: 'Assistant',
            email: 'assistant@identa.test',
            role: 'assistant',
            account_status: 'active',
            assistant_permissions: [],
        });
        vi.mocked(listAllAppointments).mockResolvedValue([]);

        renderPage();

        const denied = await screen.findByRole('heading', { name: 'Access denied' });
        expect(denied).toBeInTheDocument();
        expect(listAllAppointments).not.toHaveBeenCalled();
    });

    it('opens appointment creation with selected day context from a week column', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([]);

        renderPage();

        expect(await screen.findByText('Work dashboard')).toBeInTheDocument();
        const firstDayColumn = screen.getAllByRole('button', { name: 'Add' })[0].closest('section');
        expect(firstDayColumn).not.toBeNull();

        fireEvent.click(within(firstDayColumn as HTMLElement).getByRole('button', { name: 'Add' }));

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Schedule Appointment/i })).toBeInTheDocument();
    });
});
