import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddAppointmentDialog } from '@/components/appointments/add-appointment-dialog';
import { createAppointment, getPatient, listAppointments, listPatients } from '@/lib/api/dentist';
import { toast } from 'sonner';
import { I18nProvider } from '@/components/providers/i18n-provider';

vi.mock('@/components/ui/select', async () => {
    const React = await import('react');
    type SelectContextValue = {
        value?: string;
        onValueChange?: (value: string) => void;
    };
    const SelectContext = React.createContext<SelectContextValue>({});

    function Select({
        value,
        onValueChange,
        children,
    }: {
        value?: string;
        onValueChange?: (value: string) => void;
        children: React.ReactNode;
    }) {
        return (
            <SelectContext.Provider value={{ value, onValueChange }}>
                {children}
            </SelectContext.Provider>
        );
    }

    function SelectTrigger({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
        return (
            <div id={id} className={className}>
                {children}
            </div>
        );
    }

    function SelectValue() {
        const context = React.useContext(SelectContext);
        return <span>{context.value}</span>;
    }

    function SelectContent({ children }: { children: React.ReactNode }) {
        return <div>{children}</div>;
    }

    function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
        const context = React.useContext(SelectContext);
        return (
            <button type="button" onClick={() => context.onValueChange?.(value)}>
                {children}
            </button>
        );
    }

    return {
        Select,
        SelectTrigger,
        SelectValue,
        SelectContent,
        SelectItem,
    };
});

vi.mock('@/components/ui/dialog', async () => {
    const React = await import('react');

    function Dialog({ open, children }: { open: boolean; children: React.ReactNode }) {
        if (!open) {
            return null;
        }

        return <div data-testid="dialog-root">{children}</div>;
    }

    function DialogContent({ className, children }: { className?: string; children: React.ReactNode }) {
        return <div className={className}>{children}</div>;
    }

    function DialogHeader({ children }: { children: React.ReactNode }) {
        return <div>{children}</div>;
    }

    function DialogTitle({ children }: { children: React.ReactNode }) {
        return <h2>{children}</h2>;
    }

    function DialogDescription({ children }: { children: React.ReactNode }) {
        return <p>{children}</p>;
    }

    function DialogFooter({ children }: { children: React.ReactNode }) {
        return <div>{children}</div>;
    }

    return {
        Dialog,
        DialogContent,
        DialogHeader,
        DialogTitle,
        DialogDescription,
        DialogFooter,
    };
});

vi.mock('@/lib/api/dentist', () => ({
    createAppointment: vi.fn(),
    listAppointments: vi.fn(),
    listPatients: vi.fn(),
    getPatient: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

function Providers({ client, children }: { client: QueryClient; children: React.ReactNode }) {
    return (
        <QueryClientProvider client={client}>
            <I18nProvider initialLocale="en">
                {children}
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('AddAppointmentDialog', () => {
    const buildPatientsResponse = (patients: unknown[]) => ({
        data: patients,
        meta: {
            pagination: {
                page: 1,
                per_page: 20,
                total: patients.length,
                total_pages: 1,
            },
        },
    });
    const buildAppointmentsResponse = (appointments: unknown[]) => ({
        data: appointments,
        meta: {
            pagination: {
                page: 1,
                per_page: 100,
                total: appointments.length,
                total_pages: 1,
            },
        },
    });

    beforeEach(() => {
        vi.mocked(createAppointment).mockReset();
        vi.mocked(listAppointments).mockReset();
        vi.mocked(listPatients).mockReset();
        vi.mocked(getPatient).mockReset();
        vi.mocked(toast.success).mockReset();
        vi.mocked(toast.error).mockReset();
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([]));
        vi.mocked(listAppointments).mockResolvedValue(buildAppointmentsResponse([]));
        vi.mocked(getPatient).mockResolvedValue({
            id: 'patient-fallback',
            patient_id: 'PT-FALLBACK',
            full_name: 'Fallback Patient',
            phone: '+10000000999',
            secondary_phone: null,
            address: null,
            date_of_birth: null,
            gender: null,
            medical_history: null,
            allergies: null,
            current_medications: null,
            created_at: null,
            last_visit_at: null,
            categories: [],
        });
    });

    it('prefills date and time from dialog props', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });

        render(
            <Providers client={queryClient}>
                <AddAppointmentDialog
                    open={true}
                    onOpenChange={vi.fn()}
                    prefillDate="2026-02-20"
                    prefillStartTime="14:30"
                />
            </Providers>
        );

        await waitFor(() => {
            expect((screen.getByLabelText(/Date/i) as HTMLInputElement).value).toBe('2026-02-20');
            expect((screen.getByLabelText(/Time/i) as HTMLInputElement).value).toBe('14:30');
        });
    });

    it('prefills patient selection from prefillPatientId', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });

        vi.mocked(getPatient).mockResolvedValueOnce({
            id: 'patient-prefill',
            patient_id: 'PT-9001',
            full_name: 'Prefilled Patient',
            phone: '+10000000011',
            secondary_phone: null,
            address: null,
            date_of_birth: null,
            gender: null,
            medical_history: null,
            allergies: null,
            current_medications: null,
            created_at: null,
            last_visit_at: null,
            categories: [],
        });

        render(
            <Providers client={queryClient}>
                <AddAppointmentDialog
                    open={true}
                    onOpenChange={vi.fn()}
                    prefillPatientId="patient-prefill"
                />
            </Providers>
        );

        await waitFor(() => {
            expect(screen.getByText('Selected: Prefilled Patient (PT-9001)')).toBeInTheDocument();
        });
    });

    it('loads updated prefill patient when dialog remounts with a new patient id', async () => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });

        vi.mocked(getPatient).mockImplementation(async (id) => ({
            id,
            patient_id: id === 'patient-2' ? 'PT-0002' : 'PT-0001',
            full_name: id === 'patient-2' ? 'Second Patient' : 'First Patient',
            phone: '+10000000111',
            secondary_phone: null,
            address: null,
            date_of_birth: null,
            gender: null,
            medical_history: null,
            allergies: null,
            current_medications: null,
            created_at: null,
            last_visit_at: null,
            categories: [],
        }));

        const view = render(
            <Providers client={queryClient}>
                <AddAppointmentDialog
                    key="prefill-1"
                    open={true}
                    onOpenChange={vi.fn()}
                    prefillPatientId="patient-1"
                />
            </Providers>
        );

        await waitFor(() => {
            expect(screen.getByText('Selected: First Patient (PT-0001)')).toBeInTheDocument();
        });

        view.rerender(
            <Providers client={queryClient}>
                <AddAppointmentDialog
                    key="prefill-2"
                    open={true}
                    onOpenChange={vi.fn()}
                    prefillPatientId="patient-2"
                />
            </Providers>
        );

        await waitFor(() => {
            expect(screen.getByText('Selected: Second Patient (PT-0002)')).toBeInTheDocument();
        });
    });

    it('allows submission for past date/time slots', async () => {
        const user = userEvent.setup();
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });

        vi.mocked(createAppointment).mockResolvedValue({
            id: 'created-past-appointment',
            patient_id: 'patient-fallback',
            patient_name: 'Fallback Patient',
            appointment_date: '2099-01-01',
            start_time: '09:00',
            end_time: '09:30',
            status: 'scheduled',
            notes: null,
        });
        vi.mocked(getPatient).mockResolvedValueOnce({
            id: 'patient-fallback',
            patient_id: 'PT-FALLBACK',
            full_name: 'Fallback Patient',
            phone: '+10000000999',
            secondary_phone: null,
            address: null,
            date_of_birth: null,
            gender: null,
            medical_history: null,
            allergies: null,
            current_medications: null,
            created_at: null,
            last_visit_at: null,
            categories: [],
        });

        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const pastDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

        render(
            <Providers client={queryClient}>
                <AddAppointmentDialog
                    open={true}
                    onOpenChange={vi.fn()}
                    prefillPatientId="patient-fallback"
                    prefillDate={pastDate}
                    prefillStartTime="09:00"
                />
            </Providers>
        );

        const submitButtons = screen.getAllByRole('button', { name: /Schedule Appointment/i });
        await user.click(submitButtons[submitButtons.length - 1]);

        await waitFor(() => {
            expect(vi.mocked(createAppointment)).toHaveBeenCalledWith({
                patient_id: 'patient-fallback',
                appointment_date: pastDate,
                start_time: '09:00',
                end_time: '09:30',
                status: 'scheduled',
                reason: undefined,
            });
        });
    });

    it('blocks submission when selected slot overlaps with existing appointments', async () => {
        const user = userEvent.setup();
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });

        vi.mocked(getPatient).mockResolvedValueOnce({
            id: 'patient-fallback',
            patient_id: 'PT-FALLBACK',
            full_name: 'Fallback Patient',
            phone: '+10000000999',
            secondary_phone: null,
            address: null,
            date_of_birth: null,
            gender: null,
            medical_history: null,
            allergies: null,
            current_medications: null,
            created_at: null,
            last_visit_at: null,
            categories: [],
        });
        vi.mocked(listAppointments).mockResolvedValueOnce(buildAppointmentsResponse([
            {
                id: 'existing-appointment',
                patient_id: 'other-patient',
                patient_name: 'Other Patient',
                appointment_date: '2099-01-01',
                start_time: '09:15',
                end_time: '09:45',
                status: 'scheduled',
                notes: null,
            },
        ]));

        render(
            <Providers client={queryClient}>
                <AddAppointmentDialog
                    open={true}
                    onOpenChange={vi.fn()}
                    prefillPatientId="patient-fallback"
                    prefillDate="2099-01-01"
                    prefillStartTime="09:00"
                />
            </Providers>
        );

        const submitButtons = screen.getAllByRole('button', { name: /Schedule Appointment/i });
        await user.click(submitButtons[submitButtons.length - 1]);

        await waitFor(() => {
            expect(vi.mocked(createAppointment)).not.toHaveBeenCalled();
            expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
                'This time slot is already occupied.'
            );
        });
    });

    it('allows submission when overlap exists only with no_show appointments', async () => {
        const user = userEvent.setup();
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });

        vi.mocked(createAppointment).mockResolvedValue({
            id: 'created-appointment',
            patient_id: 'patient-fallback',
            patient_name: 'Fallback Patient',
            appointment_date: '2099-01-01',
            start_time: '09:00',
            end_time: '09:30',
            status: 'scheduled',
            notes: null,
        });
        vi.mocked(getPatient).mockResolvedValueOnce({
            id: 'patient-fallback',
            patient_id: 'PT-FALLBACK',
            full_name: 'Fallback Patient',
            phone: '+10000000999',
            secondary_phone: null,
            address: null,
            date_of_birth: null,
            gender: null,
            medical_history: null,
            allergies: null,
            current_medications: null,
            created_at: null,
            last_visit_at: null,
            categories: [],
        });
        vi.mocked(listAppointments).mockResolvedValueOnce(buildAppointmentsResponse([
            {
                id: 'existing-no-show',
                patient_id: 'other-patient',
                patient_name: 'Other Patient',
                appointment_date: '2099-01-01',
                start_time: '09:15',
                end_time: '09:45',
                status: 'no_show',
                notes: null,
            },
        ]));

        render(
            <Providers client={queryClient}>
                <AddAppointmentDialog
                    open={true}
                    onOpenChange={vi.fn()}
                    prefillPatientId="patient-fallback"
                    prefillDate="2099-01-01"
                    prefillStartTime="09:00"
                />
            </Providers>
        );

        const submitButtons = screen.getAllByRole('button', { name: /Schedule Appointment/i });
        await user.click(submitButtons[submitButtons.length - 1]);

        await waitFor(() => {
            expect(vi.mocked(createAppointment)).toHaveBeenCalledWith({
                patient_id: 'patient-fallback',
                appointment_date: '2099-01-01',
                start_time: '09:00',
                end_time: '09:30',
                status: 'scheduled',
                reason: undefined,
            });
        });
    });

    it('filters patient options by search term', async () => {
        const user = userEvent.setup();
        const allPatients = [
            {
                id: 'patient-1',
                patient_id: 'PT-0001',
                full_name: 'Alice Adams',
                phone: '+10000000001',
                secondary_phone: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
                created_at: null,
                last_visit_at: null,
                categories: [],
            },
            {
                id: 'patient-2',
                patient_id: 'PT-0002',
                full_name: 'Bobby Brown',
                phone: '+10000000002',
                secondary_phone: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
                created_at: null,
                last_visit_at: null,
                categories: [],
            },
        ];

        vi.mocked(listPatients).mockImplementation(async (options) => {
            const search = options?.filter?.search;
            if (search === 'alice') {
                return buildPatientsResponse([allPatients[0]]);
            }

            return buildPatientsResponse(allPatients);
        });

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });

        render(
            <Providers client={queryClient}>
                <AddAppointmentDialog open={true} onOpenChange={vi.fn()} />
            </Providers>
        );

        const patientInputs = screen.getAllByPlaceholderText(/Search by name or phone/i);
        const patientInput = patientInputs[patientInputs.length - 1] as HTMLInputElement;
        await user.click(patientInput);
        await user.type(patientInput, 'alice');

        await waitFor(() => {
            const listboxes = screen.getAllByRole('listbox');
            const activeListbox = listboxes.find(
                (element) => window.getComputedStyle(element).pointerEvents !== 'none'
            ) ?? listboxes[listboxes.length - 1];
            const scoped = within(activeListbox);
            expect(scoped.getByText(/Alice Adams/)).toBeInTheDocument();
            expect(scoped.queryByText(/Bobby Brown/)).not.toBeInTheDocument();
        });

        await waitFor(() => {
            expect(vi.mocked(listPatients).mock.calls.some((call) => call[0]?.filter?.search === 'alice')).toBe(true);
        });
    });

    it('filters patient options by phone number', async () => {
        const user = userEvent.setup();
        const allPatients = [
            {
                id: 'patient-1',
                patient_id: 'PT-0001',
                full_name: 'Alice Adams',
                phone: '+998901111111',
                secondary_phone: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
                created_at: null,
                last_visit_at: null,
                categories: [],
            },
            {
                id: 'patient-2',
                patient_id: 'PT-0002',
                full_name: 'Bobby Brown',
                phone: '+998902222222',
                secondary_phone: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
                created_at: null,
                last_visit_at: null,
                categories: [],
            },
        ];

        vi.mocked(listPatients).mockImplementation(async (options) => {
            const search = options?.filter?.search;
            if (search === '2222') {
                return buildPatientsResponse([allPatients[1]]);
            }

            return buildPatientsResponse(allPatients);
        });

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });

        render(
            <Providers client={queryClient}>
                <AddAppointmentDialog open={true} onOpenChange={vi.fn()} />
            </Providers>
        );

        const patientInputs = screen.getAllByPlaceholderText(/Search by name or phone/i);
        const patientInput = patientInputs[patientInputs.length - 1] as HTMLInputElement;
        await user.click(patientInput);
        await user.type(patientInput, '2222');

        await waitFor(() => {
            const listboxes = screen.getAllByRole('listbox');
            const activeListbox = listboxes.find(
                (element) => window.getComputedStyle(element).pointerEvents !== 'none'
            ) ?? listboxes[listboxes.length - 1];
            const scoped = within(activeListbox);
            expect(scoped.getByText(/Bobby Brown/)).toBeInTheDocument();
            expect(scoped.queryByText(/Alice Adams/)).not.toBeInTheDocument();
        });

        await waitFor(() => {
            expect(vi.mocked(listPatients).mock.calls.some((call) => call[0]?.filter?.search === '2222')).toBe(true);
        });
    });

    it('keeps patient options closed until input is clicked', async () => {
        const user = userEvent.setup();
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([
            {
                id: 'patient-1',
                patient_id: 'PT-0001',
                full_name: 'Alice Adams',
                phone: '+998901111111',
                secondary_phone: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
                created_at: null,
                last_visit_at: null,
                categories: [],
            },
        ]));

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });

        const view = render(
            <Providers client={queryClient}>
                <AddAppointmentDialog open={true} onOpenChange={vi.fn()} />
            </Providers>
        );

        const scoped = within(view.container);
        expect(scoped.queryByRole('listbox')).not.toBeInTheDocument();

        const patientInputs = scoped.getAllByPlaceholderText(/Search by name or phone/i);
        const patientInput = patientInputs[patientInputs.length - 1] as HTMLInputElement;
        await user.click(patientInput);

        expect(scoped.getByRole('listbox')).toBeInTheDocument();
    });
});
