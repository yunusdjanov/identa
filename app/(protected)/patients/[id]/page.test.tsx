import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PatientDetailPage from '@/app/(protected)/patients/[id]/page';
import { archivePatient, getCurrentUser, getPatient, getPatientOverview } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

let searchString = '';
const routerMocks = vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => routerMocks,
    useSearchParams: () => new URLSearchParams(searchString),
}));

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    getPatient: vi.fn(),
    getPatientOverview: vi.fn(),
    uploadPatientOralPhoto: vi.fn(),
    deletePatientOralPhoto: vi.fn(),
    replacePatientOralPhoto: vi.fn(),
    archivePatient: vi.fn(),
    restorePatient: vi.fn(),
    permanentlyDeletePatient: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock('@/components/patients/treatment-history-card', () => ({
    TreatmentHistoryCard: ({ patientId, patientName }: { patientId: string; patientName: string }) => (
        <section data-testid="patient-detail-work-history" data-patient-id={patientId}>
            Work History for {patientName}
        </section>
    ),
}));

vi.mock('@/components/appointments/add-appointment-dialog', () => ({
    AddAppointmentDialog: ({
        open,
        onOpenChange,
        prefillPatientId,
    }: {
        open: boolean;
        onOpenChange: (open: boolean) => void;
        prefillPatientId?: string;
    }) => open ? (
        <section aria-label="Schedule Appointment Dialog" role="dialog">
            Appointment for {prefillPatientId}
            <button type="button" onClick={() => onOpenChange(false)}>
                Close appointment dialog
            </button>
        </section>
    ) : null,
}));

const dentist = {
    id: '1',
    name: 'Demo Dentist',
    email: 'dentist@identa.test',
    role: 'dentist' as const,
    account_status: 'active' as const,
};

const patient = {
    id: 'p-1',
    full_name: 'John Smith',
    phone: null,
    secondary_phone: null,
    address: null,
    date_of_birth: null,
    gender: null,
    allergies: null,
    current_medications: null,
    medical_history: null,
    categories: [],
    last_visit_at: null,
    deleted_at: null,
};

const overview = { appointment_count: 0, visit_count: 0, upcoming_appointments: [], total_balance: 0 };

// `PatientDetailPage` calls `use(params)`, which suspends on first render.
// Wrapping the initial render in `act(async () => …)` flushes the resolved
// params promise (and the first round of query microtasks) so the component
// progresses past the Suspense boundary deterministically.
async function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    await act(async () => {
        render(
            <QueryClientProvider client={queryClient}>
                <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                    <Suspense fallback={<div>loading</div>}>
                        <PatientDetailPage params={Promise.resolve({ id: 'p-1' })} />
                    </Suspense>
                </I18nProvider>
            </QueryClientProvider>
        );
    });
}

describe('PatientDetailPage', () => {
    beforeEach(() => {
        searchString = '';
        routerMocks.push.mockReset();
        routerMocks.replace.mockReset();
        routerMocks.back.mockReset();
        routerMocks.refresh.mockReset();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getPatient).mockReset();
        vi.mocked(getPatientOverview).mockReset();
        vi.mocked(getPatientOverview).mockResolvedValue(overview as never);
    });

    afterEach(() => {
        cleanup();
    });

    it('shows an error state with retry when the patient fails to load', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockRejectedValue(new Error('boom'));

        await renderPage();

        // common.loadErrorTitle (EN) = "Could not load data"
        expect(await screen.findByText('Could not load data')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('shows a not-found state when the patient does not exist', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(null as never);

        await renderPage();

        // patientDetail.notFound (EN) = "Patient not found"
        expect(await screen.findByText('Patient not found')).toBeInTheDocument();
    });

    it('renders the patient header when data loads', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(patient as never);

        await renderPage();

        expect(await screen.findByText('John Smith')).toBeInTheDocument();
        const scheduleButton = screen.getByRole('button', { name: 'Schedule Appointment' });
        const editButton = screen.getByRole('button', { name: 'Edit Patient' });
        const archiveButton = screen.getByRole('button', { name: 'Archive' });
        const identity = screen.getByTestId('patient-detail-header-identity');
        const facts = screen.getByTestId('patient-detail-header-facts');
        const contactFacts = screen.getByTestId('patient-detail-header-contact-facts');
        const medicalFacts = screen.getByTestId('patient-detail-header-medical-facts');
        const actionGroup = screen.getByTestId('patient-detail-header-actions');
        expect(identity).toHaveClass('max-w-[20rem]');
        expect(facts).toHaveClass(
            'h-auto',
            'overflow-visible',
            'md:h-[8rem]',
            'md:overflow-hidden'
        );
        expect(contactFacts).toHaveClass('md:grid-cols-3');
        expect(medicalFacts).toHaveClass('md:grid-cols-3');
        expect(scheduleButton).toHaveClass('size-10');
        expect(editButton).toHaveClass('size-10');
        expect(archiveButton).toHaveClass('size-10');
        expect(archiveButton.querySelector('svg')).toHaveClass('lucide-archive');
        expect(actionGroup).toHaveClass('flex-col', 'items-end');
        expect(screen.queryByText('Schedule Appointment')).not.toBeInTheDocument();
        expect(screen.queryByText('Edit Patient')).not.toBeInTheDocument();
        expect(screen.queryByText('Archive')).not.toBeInTheDocument();
        expect(scheduleButton.compareDocumentPosition(editButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('wraps long patient names after the first two words in the header', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue({
            ...patient,
            full_name: 'Gleb Rahmanov dilmurod oilasi madinabonu zangiota tumani',
        } as never);

        await renderPage();

        const headerName = await screen.findByTestId('patient-detail-header-name');
        expect(within(headerName).getByText('Gleb Rahmanov')).toHaveClass('block', 'truncate');
        const secondLine = within(headerName).getByText(/^dilmurod oilasi/);
        expect(secondLine).toHaveClass('block', 'truncate');
        expect(secondLine).not.toHaveTextContent('zangiota');
    });

    it('returns to the patients list with the restore marker from the header arrow', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(patient as never);
        await renderPage();
        const user = userEvent.setup();

        await user.click(await screen.findByRole('button', { name: 'Back to Patients' }));

        expect(routerMocks.push).toHaveBeenCalledWith('/patients?restore=1');
    });

    it('opens appointment scheduling with the current patient preselected', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(patient as never);
        await renderPage();
        const user = userEvent.setup();

        await user.click(await screen.findByRole('button', { name: 'Schedule Appointment' }));

        expect(await screen.findByRole('dialog', { name: 'Schedule Appointment Dialog' })).toBeInTheDocument();
        expect(screen.getByText('Appointment for p-1')).toBeInTheDocument();
    });

    it('passes the recent-search flag to the patient detail request', async () => {
        searchString = 'remember_recent=1';
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(patient as never);

        await renderPage();

        expect(await screen.findByText('John Smith')).toBeInTheDocument();
        expect(getPatient).toHaveBeenCalledWith('p-1', { rememberRecent: true });
    });

    it('opens a read-only preview from the patient header photo', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue({
            ...patient,
            photo_url: 'https://media.identa.test/patient-original.webp',
            photo_thumbnail_url: 'https://media.identa.test/patient-thumb.webp',
            photo_preview_url: 'https://media.identa.test/patient-preview.webp',
            photo_thumbnail_ready: true,
            photo_preview_ready: true,
            photo_scan_status: 'approved',
        } as never);
        await renderPage();
        const user = userEvent.setup();

        const photoTrigger = await screen.findByRole('button', { name: 'Patient Photo: John Smith' });
        expect(photoTrigger).toHaveClass('h-24', 'w-24', 'absolute', 'rounded-xl');
        expect(photoTrigger.parentElement).toHaveClass('h-20', 'w-24');

        await user.click(photoTrigger);

        const dialog = await screen.findByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('keeps long address values compact in the header facts strip', async () => {
        const longAddress =
            '4501 Garfield Centers, B block 23 floor 334# Room. Main road street side. 4501 Garfield Centers, B block 23 floor 334# Room.';
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue({ ...patient, address: longAddress } as never);

        await renderPage();

        const headerFacts = await screen.findByTestId('patient-detail-header-facts');
        const addressValue = await screen.findByTitle(longAddress);
        expect(headerFacts).toContainElement(addressValue);
        expect(addressValue).toHaveClass('truncate');
        expect(addressValue).toHaveTextContent('4501 Garfield Centers');
    });

    it('renders contact and medical facts in the patient header', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue({
            ...patient,
            phone: '+998901234567',
            secondary_phone: '+998901112233',
            date_of_birth: '1990-08-30',
            address: 'Main road 12',
            allergies: 'Penicillin',
            current_medications: 'Aspirin',
            medical_history: 'Hypertension',
        } as never);

        await renderPage();

        const headerFacts = await screen.findByTestId('patient-detail-header-facts');
        const contactFacts = within(headerFacts).getByTestId('patient-detail-header-contact-facts');
        const medicalFacts = within(headerFacts).getByTestId('patient-detail-header-medical-facts');

        expect(within(contactFacts).getByText('+998901234567')).toBeInTheDocument();
        expect(within(contactFacts).getByText('+998901112233')).toBeInTheDocument();
        expect(contactFacts).not.toHaveTextContent('+998901234567 / +998901112233');
        expect(within(contactFacts).getByText('Aug 30, 1990')).toBeInTheDocument();
        expect(within(contactFacts).getByText('Main road 12')).toBeInTheDocument();
        expect(within(medicalFacts).getByText('Penicillin')).toBeInTheDocument();
        expect(within(medicalFacts).getByText('Aspirin')).toBeInTheDocument();
        expect(within(medicalFacts).getByText('Hypertension')).toBeInTheDocument();
        expect(within(medicalFacts).queryByTestId('patient-detail-header-medical-empty')).not.toBeInTheDocument();
        expect(screen.queryByText('Basic Information')).not.toBeInTheDocument();
        expect(screen.queryByTestId('patient-detail-contact-card')).not.toBeInTheDocument();
        expect(screen.queryByTestId('patient-detail-clinical-strip')).not.toBeInTheDocument();
    });

    it('keeps the header facts compact when no medical facts are recorded', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(patient as never);

        await renderPage();

        const headerFacts = await screen.findByTestId('patient-detail-header-facts');
        const medicalFacts = within(headerFacts).getByTestId('patient-detail-header-medical-facts');

        expect(within(medicalFacts).getByTestId('patient-detail-header-medical-empty')).toHaveTextContent(
            'No medical information recorded'
        );
        expect(within(headerFacts).getAllByText('—')).toHaveLength(3);
        expect(screen.queryByText('Basic Information')).not.toBeInTheDocument();
        expect(screen.queryByTestId('patient-detail-contact-card')).not.toBeInTheDocument();
        expect(screen.queryByTestId('patient-detail-clinical-strip')).not.toBeInTheDocument();
    });

    it('renders the total visits from the overview visit count', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(patient as never);
        vi.mocked(getPatientOverview).mockResolvedValue({
            ...overview,
            appointment_count: 0,
            visit_count: 2,
        } as never);

        await renderPage();

        expect(await screen.findByText('Total Visits')).toBeInTheDocument();
        expect(screen.getByTitle('2')).toBeInTheDocument();
    });

    it('does not show an inactive-days badge when the patient has no last visit', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(patient as never);

        await renderPage();

        expect(await screen.findByText('Never')).toBeInTheDocument();
        expect(screen.queryByText(/Infinityd/i)).not.toBeInTheDocument();
    });

    it('renders the compact oral photo card with the summary cards', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(patient as never);

        await renderPage();

        const detailCard = await screen.findByText('Detail');
        const oralPhotoTitle = screen.getByText('General Photos');

        expect(screen.getAllByText('General Photos')).toHaveLength(1);
        expect(screen.queryByText('Smile')).not.toBeInTheDocument();
        expect(screen.queryByText('Top')).not.toBeInTheDocument();
        expect(screen.queryByText('Bottom')).not.toBeInTheDocument();
        expect(screen.queryByText('Appointments')).not.toBeInTheDocument();
        expect(await screen.findByTestId('patient-detail-work-history')).toHaveAttribute('data-patient-id', 'p-1');
        expect(screen.getByTestId('patient-detail-work-history')).toHaveTextContent('Work History for John Smith');
        expect(screen.getByText('0/10')).toBeInTheDocument();
        expect(screen.getAllByTitle('Upload')).toHaveLength(10);
        expect(screen.getByTestId('patient-detail-page-layout')).toHaveClass('space-y-2.5');
        expect(screen.getByTestId('patient-detail-summary-grid')).toHaveClass(
            'gap-2.5',
            'lg:grid-cols-[minmax(0,1fr)_15rem]',
            'xl:grid-cols-[minmax(0,1fr)_16rem]',
        );
        expect(screen.getByTestId('patient-detail-oral-photo-grid')).toHaveClass('h-full', 'min-h-0');
        expect(screen.getAllByTestId('patient-detail-oral-photo-slot')).toHaveLength(10);
        expect(screen.getAllByTestId('patient-detail-oral-photo-slot')[0]).toHaveClass('h-full', 'min-h-0', 'w-full');
        expect(oralPhotoTitle.compareDocumentPosition(detailCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('hides ready status copy for completed oral photos', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue({
            ...patient,
            oral_photos: {
                smile: {
                    id: 'smile-photo',
                    view_type: 'smile',
                    scan_status: 'approved',
                    thumbnail_url: 'https://media.identa.test/smile-thumb.webp',
                    preview_url: 'https://media.identa.test/smile-preview.webp',
                    thumbnail_ready: true,
                    preview_ready: true,
                },
                top: {
                    id: 'top-photo',
                    view_type: 'top',
                    scan_status: 'approved',
                    thumbnail_url: 'https://media.identa.test/top-thumb.webp',
                    preview_url: 'https://media.identa.test/top-preview.webp',
                    thumbnail_ready: true,
                    preview_ready: true,
                },
                bottom: {
                    id: 'bottom-photo',
                    view_type: 'bottom',
                    scan_status: 'approved',
                    thumbnail_url: 'https://media.identa.test/bottom-thumb.webp',
                    preview_url: 'https://media.identa.test/bottom-preview.webp',
                    thumbnail_ready: true,
                    preview_ready: true,
                },
            },
        } as never);

        await renderPage();

        expect(await screen.findByText('General Photos')).toBeInTheDocument();
        expect(screen.queryByText('Ready')).not.toBeInTheDocument();
        expect(screen.queryByText('No photo')).not.toBeInTheDocument();
        expect(screen.queryByText('Smile')).not.toBeInTheDocument();
        expect(screen.queryByText('Top')).not.toBeInTheDocument();
        expect(screen.queryByText('Bottom')).not.toBeInTheDocument();
        expect(screen.getByText('1/10')).toBeInTheDocument();
        expect(screen.getAllByTitle('Upload')).toHaveLength(9);
        expect(screen.getAllByTitle('View')).toHaveLength(1);
        expect(screen.getAllByTitle('View')[0]).toHaveClass('h-full', 'min-h-0', 'w-full');
        expect(within(screen.getAllByTitle('View')[0]).queryByText('1')).not.toBeInTheDocument();
        expect(screen.queryAllByTitle('Delete')).toHaveLength(0);
    });

    it('opens the oral photo gallery from the edit action', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue({
            ...patient,
            oral_photo_galleries: {
                smile: [
                    {
                        id: 'smile-photo-1',
                        view_type: 'smile',
                        scan_status: 'approved',
                        thumbnail_url: 'https://media.identa.test/smile-1-thumb.webp',
                        preview_url: 'https://media.identa.test/smile-1-preview.webp',
                        thumbnail_ready: true,
                        preview_ready: true,
                    },
                    {
                        id: 'smile-photo-2',
                        view_type: 'smile',
                        scan_status: 'approved',
                        thumbnail_url: 'https://media.identa.test/smile-2-thumb.webp',
                        preview_url: 'https://media.identa.test/smile-2-preview.webp',
                        thumbnail_ready: true,
                        preview_ready: true,
                    },
                ],
            },
        } as never);
        await renderPage();
        const user = userEvent.setup();

        await user.click((await screen.findAllByRole('button', { name: 'View' }))[0]);

        expect(await screen.findByRole('dialog')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
        expect(screen.getByText('1 / 2')).toBeInTheDocument();
    });

    it('archives the patient through the confirm dialog', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(patient as never);
        await renderPage();
        const user = userEvent.setup();

        expect(await screen.findByText('John Smith')).toBeInTheDocument();

        // Open the archive confirmation (the visible header action).
        await user.click(screen.getAllByRole('button', { name: 'Archive' })[0]);

        // The dialog's confirm button carries the distinct "Archive Patient" label.
        const confirm = await screen.findByRole('button', { name: 'Archive Patient' });
        await user.click(confirm);

        expect(archivePatient).toHaveBeenCalledWith('p-1');
    });
});
