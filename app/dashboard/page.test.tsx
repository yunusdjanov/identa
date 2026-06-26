import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/dashboard/page';
import {
    createPatientCardFromGuestAppointment,
    deleteAppointment,
    getCurrentUser,
    getProfile,
    listAllAppointments,
    updateAppointment,
} from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { toLocalDateKey } from '@/lib/utils';

const addAppointmentDialogSpy = vi.fn();
const addPatientDialogSpy = vi.fn();

vi.mock('@/lib/api/dentist', () => ({
    createPatientCardFromGuestAppointment: vi.fn(),
    deleteAppointment: vi.fn(),
    getCurrentUser: vi.fn(),
    getProfile: vi.fn(),
    listAllAppointments: vi.fn(),
    updateAppointment: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('@/components/appointments/add-appointment-dialog', () => ({
    AddAppointmentDialog: (props: { open: boolean }) => {
        addAppointmentDialogSpy(props);
        if (!props.open) {
            return null;
        }

        return (
            <div role="dialog">
                <h2>Schedule Appointment</h2>
            </div>
        );
    },
}));

vi.mock('@/components/patients/add-patient-dialog', () => ({
    AddPatientDialog: (props: { open: boolean }) => {
        addPatientDialogSpy(props);
        if (!props.open) {
            return null;
        }

        return (
            <div role="dialog">
                <h2>Add Patient</h2>
            </div>
        );
    },
}));

vi.mock('@/components/ui/confirm-action-dialog', () => ({
    ConfirmActionDialog: () => null,
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

function renderPage(initialPath = '/dashboard?view=week') {
    window.history.replaceState({}, '', initialPath);

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
        addAppointmentDialogSpy.mockClear();
        addPatientDialogSpy.mockClear();
        vi.mocked(createPatientCardFromGuestAppointment).mockReset();
        vi.mocked(deleteAppointment).mockReset();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getProfile).mockReset();
        vi.mocked(listAllAppointments).mockReset();
        vi.mocked(updateAppointment).mockReset();

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
        vi.mocked(listAllAppointments).mockResolvedValue([]);
    });

    afterEach(() => {
        cleanup();
    });

    it('renders the dashboard header and planner without summary stats', async () => {
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

        expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Schedule Appointment' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Add Patient' })).toBeInTheDocument();
        expect(screen.queryByText('Total appointments')).not.toBeInTheDocument();
        expect(screen.queryByText('Starting Soon')).not.toBeInTheDocument();
        expect(screen.queryByText('Cancelled / no-show')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Week View' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Day View' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Month/i })).not.toBeInTheDocument();
        expect(screen.queryByText('Collected This Month')).not.toBeInTheDocument();
        expect(screen.queryByText('Outstanding Debts')).not.toBeInTheDocument();
        expect(screen.getByText('Alisher Karimov')).toBeInTheDocument();

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

    it('keeps dashboard routing while switching views and splits day slots into two columns', async () => {
        renderPage('/dashboard?view=day');

        expect(await screen.findByText('0 appointments')).toBeInTheDocument();
        expect(screen.getByTestId('day-slot-column-0')).toBeInTheDocument();
        expect(screen.getByTestId('day-slot-column-1')).toBeInTheDocument();
        expect(within(screen.getByTestId('day-slot-column-0')).getByText('09:00')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Week View' }));

        await waitFor(() => {
            expect(window.location.pathname).toBe('/dashboard');
            expect(window.location.search).toContain('view=week');
        });
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

        renderPage();

        const denied = await screen.findByRole('heading', { name: 'No access' });
        expect(denied).toBeInTheDocument();
        expect(screen.getByText('Access denied')).toBeInTheDocument();
        expect(listAllAppointments).not.toHaveBeenCalled();
    });

    it('opens appointment creation from a week column without leaving the dashboard', async () => {
        renderPage();

        expect(await screen.findByRole('button', { name: 'Week View' })).toBeInTheDocument();
        const firstDayColumn = screen.getAllByTestId(/^week-day-card-/)[0];

        fireEvent.click(within(firstDayColumn).getByRole('button', { name: 'Add' }));

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Schedule Appointment/i })).toBeInTheDocument();
        expect(window.location.pathname).toBe('/dashboard');
    });

    it('opens quick action dialogs from the dashboard header', async () => {
        renderPage();

        expect(await screen.findByRole('button', { name: 'Schedule Appointment' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Schedule Appointment' }));
        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Schedule Appointment/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Add Patient' }));
        expect(await screen.findByRole('heading', { name: 'Add Patient' })).toBeInTheDocument();
        expect(addPatientDialogSpy).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }));
    });
});
