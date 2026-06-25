import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PatientDetailPage from '@/app/patients/[id]/page';
import { archivePatient, getCurrentUser, getPatient, getPatientOverview } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    getPatient: vi.fn(),
    getPatientOverview: vi.fn(),
    uploadPatientOralPhoto: vi.fn(),
    deletePatientOralPhoto: vi.fn(),
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
        expect(photoTrigger).toHaveClass('h-16', 'w-16');

        await user.click(photoTrigger);

        const dialog = await screen.findByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('keeps long address values clamped in the contact card', async () => {
        const longAddress =
            '4501 Garfield Centers, B block 23 floor 334# Room. Main road street side. 4501 Garfield Centers, B block 23 floor 334# Room.';
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue({ ...patient, address: longAddress } as never);

        await renderPage();

        const addressValue = await screen.findByTitle(longAddress);
        expect(addressValue).toHaveClass('line-clamp-2');
        expect(addressValue).toHaveTextContent(longAddress);
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
        const oralPhotoTitle = screen.getByText('Oral photo');

        expect(screen.getAllByText('Oral photo')).toHaveLength(1);
        expect(screen.getByText('Smile')).toBeInTheDocument();
        expect(screen.getByText('Top')).toBeInTheDocument();
        expect(screen.getByText('Bottom')).toBeInTheDocument();
        expect(screen.queryByText('Appointments')).not.toBeInTheDocument();
        expect(await screen.findByTestId('patient-detail-work-history')).toHaveAttribute('data-patient-id', 'p-1');
        expect(screen.getByTestId('patient-detail-work-history')).toHaveTextContent('Work History for John Smith');
        expect(screen.getByText('0/18')).toBeInTheDocument();
        expect(screen.getAllByText('0/6')).toHaveLength(3);
        expect(screen.getAllByText('No photo')).toHaveLength(3);
        expect(screen.getAllByTitle('Upload')).toHaveLength(3);
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

        expect(await screen.findByText('Oral photo')).toBeInTheDocument();
        expect(screen.queryByText('Ready')).not.toBeInTheDocument();
        expect(screen.queryByText('No photo')).not.toBeInTheDocument();
        expect(screen.getByText('Smile')).toBeInTheDocument();
        expect(screen.getByText('Top')).toBeInTheDocument();
        expect(screen.getByText('Bottom')).toBeInTheDocument();
        expect(screen.getByText('3/18')).toBeInTheDocument();
        expect(screen.getAllByText('1/6')).toHaveLength(3);
        expect(screen.getAllByTitle('Upload')).toHaveLength(3);
        expect(screen.getAllByTitle('View')).toHaveLength(3);
        expect(screen.getByRole('button', { name: 'Edit Smile' })).toBeInTheDocument();
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

        await user.click(await screen.findByRole('button', { name: 'Edit Smile' }));

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
