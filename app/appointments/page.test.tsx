import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppointmentsPage from '@/app/appointments/page';
import { deleteAppointment, getProfile, listAllAppointments, updateAppointment } from '@/lib/api/dentist';
import { toLocalDateKey } from '@/lib/utils';
import { toast } from 'sonner';
import { I18nProvider } from '@/components/providers/i18n-provider';

const addAppointmentDialogSpy = vi.fn();

vi.mock('@/lib/api/dentist', () => ({
    getProfile: vi.fn(),
    listAllAppointments: vi.fn(),
    updateAppointment: vi.fn(),
    deleteAppointment: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('@/components/appointments/add-appointment-dialog', () => ({
    AddAppointmentDialog: (props: unknown) => {
        addAppointmentDialogSpy(props);
        return null;
    },
}));

vi.mock('@/components/ui/confirm-action-dialog', () => ({
    ConfirmActionDialog: () => null,
}));

function createDataTransfer(): DataTransfer {
    const store = new Map<string, string>();

    return {
        dropEffect: 'move',
        effectAllowed: 'all',
        files: [] as unknown as FileList,
        items: [] as unknown as DataTransferItemList,
        types: [],
        clearData: (format?: string) => {
            if (format) {
                store.delete(format);
                return;
            }
            store.clear();
        },
        getData: (format: string) => store.get(format) ?? '',
        setData: (format: string, data: string) => {
            store.set(format, data);
        },
        setDragImage: () => {},
    } as DataTransfer;
}

function renderPage(initialPath = '/appointments?view=day') {
    window.history.replaceState({}, '', initialPath);

    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en">
                <AppointmentsPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('AppointmentsPage drag and drop', () => {
    const today = toLocalDateKey(new Date());
    const getWeekRangeFor = (dateKey: string) => {
        const date = new Date(`${dateKey}T00:00:00`);
        const day = date.getDay();
        const diffToMonday = day === 0 ? -6 : 1 - day;
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() + diffToMonday);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        return {
            date_from: toLocalDateKey(weekStart),
            date_to: toLocalDateKey(weekEnd),
        };
    };

    beforeEach(() => {
        vi.mocked(listAllAppointments).mockReset();
        vi.mocked(getProfile).mockReset();
        vi.mocked(updateAppointment).mockReset();
        vi.mocked(deleteAppointment).mockReset();
        vi.mocked(toast.error).mockReset();
        vi.mocked(toast.success).mockReset();
        addAppointmentDialogSpy.mockReset();

        vi.spyOn(Date, 'now').mockReturnValue(new Date(`${today}T00:00:00`).getTime() - 1000);
        vi.mocked(deleteAppointment).mockResolvedValue(undefined);
        vi.mocked(getProfile).mockResolvedValue({
            id: 'profile-1',
            name: 'Dr. Test',
            email: 'doctor@example.test',
            phone: null,
            practice_name: 'Test Clinic',
            license_number: null,
            address: null,
            working_hours: {
                start: '07:00',
                end: '22:30',
            },
            default_appointment_duration: 30,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        cleanup();
    });

    it('blocks drop when moved range overlaps and shows aligned conflict message', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([
            {
                id: 'appointment-a',
                patient_id: 'patient-a',
                patient_name: 'Alice Doe',
                appointment_date: today,
                start_time: '08:00',
                end_time: '09:00',
                status: 'scheduled',
                notes: null,
            },
            {
                id: 'appointment-b',
                patient_id: 'patient-b',
                patient_name: 'Bob Doe',
                appointment_date: today,
                start_time: '10:00',
                end_time: '10:30',
                status: 'scheduled',
                notes: null,
            },
        ]);

        renderPage();

        await waitFor(() => {
            expect(screen.getByTestId('appointment-card-appointment-a')).toBeInTheDocument();
        });

        const draggedCard = screen.getByTestId('appointment-card-appointment-a');
        const dropZone = screen.getByTestId('timeslot-dropzone-09:30');
        const dataTransfer = createDataTransfer();

        fireEvent.dragStart(draggedCard, { dataTransfer });
        fireEvent.dragOver(dropZone, { dataTransfer });
        fireEvent.drop(dropZone, { dataTransfer });

        await waitFor(() => {
            expect(updateAppointment).not.toHaveBeenCalled();
            expect(toast.error).toHaveBeenCalledWith('This time slot is already occupied.');
        });
    });

    it('moves appointment when dropped onto empty time range', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([
            {
                id: 'appointment-a',
                patient_id: 'patient-a',
                patient_name: 'Alice Doe',
                appointment_date: today,
                start_time: '08:00',
                end_time: '09:00',
                status: 'scheduled',
                notes: 'Consultation',
            },
        ]);
        vi.mocked(updateAppointment).mockResolvedValue({
            id: 'appointment-a',
            patient_id: 'patient-a',
            patient_name: 'Alice Doe',
            appointment_date: today,
            start_time: '11:00',
            end_time: '12:00',
            status: 'scheduled',
            notes: 'Consultation',
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByTestId('appointment-card-appointment-a')).toBeInTheDocument();
        });

        const draggedCard = screen.getByTestId('appointment-card-appointment-a');
        const dropZone = screen.getByTestId('timeslot-dropzone-11:00');
        const dataTransfer = createDataTransfer();

        fireEvent.dragStart(draggedCard, { dataTransfer });
        fireEvent.dragOver(dropZone, { dataTransfer });
        fireEvent.drop(dropZone, { dataTransfer });

        await waitFor(() => {
            expect(updateAppointment).toHaveBeenCalledWith('appointment-a', {
                patient_id: 'patient-a',
                appointment_date: today,
                start_time: '11:00',
                end_time: '12:00',
                status: 'scheduled',
                reason: 'Consultation',
            });
        });
    });

    it('allows moving appointment into slot occupied only by no_show', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([
            {
                id: 'appointment-a',
                patient_id: 'patient-a',
                patient_name: 'Alice Doe',
                appointment_date: today,
                start_time: '08:00',
                end_time: '09:00',
                status: 'scheduled',
                notes: null,
            },
            {
                id: 'appointment-noshow',
                patient_id: 'patient-b',
                patient_name: 'No Show Patient',
                appointment_date: today,
                start_time: '09:00',
                end_time: '10:00',
                status: 'no_show',
                notes: null,
            },
        ]);
        vi.mocked(updateAppointment).mockResolvedValue({
            id: 'appointment-a',
            patient_id: 'patient-a',
            patient_name: 'Alice Doe',
            appointment_date: today,
            start_time: '09:30',
            end_time: '10:30',
            status: 'scheduled',
            notes: null,
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByTestId('appointment-card-appointment-a')).toBeInTheDocument();
        });

        const draggedCard = screen.getByTestId('appointment-card-appointment-a');
        const dropZone = screen.getByTestId('timeslot-dropzone-09:30');
        const dataTransfer = createDataTransfer();

        fireEvent.dragStart(draggedCard, { dataTransfer });
        fireEvent.dragOver(dropZone, { dataTransfer });
        fireEvent.drop(dropZone, { dataTransfer });

        await waitFor(() => {
            expect(updateAppointment).toHaveBeenCalledWith('appointment-a', {
                patient_id: 'patient-a',
                appointment_date: today,
                start_time: '09:30',
                end_time: '10:30',
                status: 'scheduled',
                reason: undefined,
            });
        });
    });

    it('shows add button when slot contains only cancelled/no_show appointments', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([
            {
                id: 'appointment-cancelled',
                patient_id: 'patient-c',
                patient_name: 'Cancelled Patient',
                appointment_date: today,
                start_time: '12:00',
                end_time: '12:30',
                status: 'cancelled',
                notes: null,
            },
            {
                id: 'appointment-noshow',
                patient_id: 'patient-n',
                patient_name: 'No Show Patient',
                appointment_date: today,
                start_time: '12:00',
                end_time: '12:30',
                status: 'no_show',
                notes: null,
            },
        ]);

        renderPage();

        const slot = await screen.findByTestId('timeslot-dropzone-12:00');
        expect(within(slot).getByRole('button', { name: /\+ Add appointment/i })).toBeInTheDocument();
    });

    it('passes URL patient prefill to add-appointment dialog when opened from patient context link', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([]);

        renderPage('/appointments?action=new&patientId=patient-prefill-123');

        await waitFor(() => {
            const matchingCall = addAppointmentDialogSpy.mock.calls.find(([props]) => {
                const dialogProps = props as { prefillPatientId?: string; open?: boolean };
                return dialogProps.prefillPatientId === 'patient-prefill-123' && dialogProps.open === true;
            });
            expect(matchingCall).toBeTruthy();
        });
    });

    it('renders continuation occupancy in covered slots for long appointments', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([
            {
                id: 'appointment-long',
                patient_id: 'patient-a',
                patient_name: 'Alice Doe',
                appointment_date: today,
                start_time: '08:00',
                end_time: '09:30',
                status: 'scheduled',
                notes: null,
            },
        ]);

        renderPage();

        await waitFor(() => {
            expect(screen.getByTestId('appointment-card-appointment-long')).toBeInTheDocument();
        });

        const coveredSlot = screen.getByTestId('timeslot-dropzone-08:30');
        expect(within(coveredSlot).getByText(/Continues until 09:30/i)).toBeInTheDocument();
        expect(within(coveredSlot).queryByRole('button', { name: /\+ Add appointment/i })).not.toBeInTheDocument();
    });

    it('uses week view by default and renders weekly day cards', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([
            {
                id: 'appointment-week-a',
                patient_id: 'patient-a',
                patient_name: 'Alice Doe',
                appointment_date: today,
                start_time: '08:00',
                end_time: '08:30',
                status: 'scheduled',
                notes: 'Checkup',
            },
        ]);

        renderPage('/appointments');

        await waitFor(() => {
            expect(screen.getByTestId(`week-day-card-${today}`)).toBeInTheDocument();
        });

        expect(screen.queryByTestId('timeslot-dropzone-08:00')).not.toBeInTheDocument();
        expect(screen.getAllByText('Alice Doe').length).toBeGreaterThan(0);
    });

    it('requests the full Monday-to-Sunday range in week view', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([]);

        renderPage('/appointments');

        await waitFor(() => {
            expect(vi.mocked(listAllAppointments)).toHaveBeenCalled();
        });

        expect(vi.mocked(listAllAppointments)).toHaveBeenCalledWith({
            sort: 'appointment_date,start_time',
            filter: getWeekRangeFor(today),
        });
    });

    it('writes the selected view into the URL so refresh preserves day mode', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([]);

        renderPage('/appointments');

        const dayButton = await screen.findByRole('button', { name: 'Day View' });
        fireEvent.click(dayButton);

        expect(window.location.search).toContain('view=day');
    });

    it('opens a per-day modal queue from the week view more button', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([
            {
                id: 'appointment-1',
                patient_id: 'patient-a',
                patient_name: 'Alice Doe',
                appointment_date: today,
                start_time: '08:00',
                end_time: '08:30',
                status: 'scheduled',
                notes: 'Checkup',
            },
            {
                id: 'appointment-2',
                patient_id: 'patient-b',
                patient_name: 'Bob Doe',
                appointment_date: today,
                start_time: '08:30',
                end_time: '09:00',
                status: 'scheduled',
                notes: 'Checkup',
            },
            {
                id: 'appointment-3',
                patient_id: 'patient-c',
                patient_name: 'Chris Doe',
                appointment_date: today,
                start_time: '09:00',
                end_time: '09:30',
                status: 'scheduled',
                notes: 'Checkup',
            },
            {
                id: 'appointment-4',
                patient_id: 'patient-d',
                patient_name: 'Dina Doe',
                appointment_date: today,
                start_time: '09:30',
                end_time: '10:00',
                status: 'scheduled',
                notes: 'Checkup',
            },
            {
                id: 'appointment-5',
                patient_id: 'patient-e',
                patient_name: 'Evan Doe',
                appointment_date: today,
                start_time: '10:00',
                end_time: '10:30',
                status: 'scheduled',
                notes: 'Checkup',
            },
            {
                id: 'appointment-6',
                patient_id: 'patient-f',
                patient_name: 'Frank Doe',
                appointment_date: today,
                start_time: '10:30',
                end_time: '11:00',
                status: 'scheduled',
                notes: 'Checkup',
            },
        ]);

        renderPage('/appointments');

        const moreButton = await screen.findByTestId(`week-day-more-${today}`);
        fireEvent.click(moreButton);

        await waitFor(() => {
            expect(screen.getByTestId('week-day-queue-modal')).toBeInTheDocument();
        });

        const modal = screen.getByTestId('week-day-queue-modal');
        expect(within(modal).getByText('Frank Doe')).toBeInTheDocument();
        expect(within(modal).getByText('10:30 - 11:00')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /(New Appointment|Новая запись|Yangi qabul)/i })).toBeInTheDocument();
    });

    it('shows add appointment action for empty week days', async () => {
        vi.mocked(listAllAppointments).mockResolvedValue([]);

        renderPage('/appointments');

        const addButton = await screen.findByTestId(`week-day-more-${today}`);
        expect(addButton).toHaveTextContent('Add');
    });
});
