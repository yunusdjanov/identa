import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
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
    archivePatient: vi.fn(),
    restorePatient: vi.fn(),
    permanentlyDeletePatient: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

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

    it('renders the compact oral photo card with the summary cards', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(patient as never);

        await renderPage();

        const detailCard = await screen.findByText('Detail');
        const oralPhotoTitle = screen.getByText('Oral photo');
        const appointmentsTitle = screen.getByText('Appointments');

        expect(screen.getAllByText('Oral photo')).toHaveLength(1);
        expect(screen.getByText('Smile')).toBeInTheDocument();
        expect(screen.getByText('Top')).toBeInTheDocument();
        expect(screen.getByText('Bottom')).toBeInTheDocument();
        expect(screen.getAllByText('No photo')).toHaveLength(3);
        expect(screen.getAllByText('Upload')).toHaveLength(3);
        expect(detailCard.compareDocumentPosition(oralPhotoTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(oralPhotoTitle.compareDocumentPosition(appointmentsTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
