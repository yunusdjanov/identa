import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PatientsPage from '@/app/patients/page';
import {
    clearRecentPatients,
    forgetRecentPatient,
    getCurrentUser,
    listPatientCategories,
    listPatients,
    listRecentPatients,
    restorePatient,
} from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: pushMock,
    }),
}));

vi.mock('@/lib/api/dentist', () => ({
    clearRecentPatients: vi.fn(),
    forgetRecentPatient: vi.fn(),
    getCurrentUser: vi.fn(),
    listPatients: vi.fn(),
    listPatientCategories: vi.fn(),
    listRecentPatients: vi.fn(),
    restorePatient: vi.fn(),
}));

vi.mock('@/components/patients/add-patient-dialog', () => ({
    AddPatientDialog: () => null,
}));

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
                <PatientsPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('PatientsPage', () => {
    // Generic so the return type carries the patient type forward. The
    // earlier `unknown[]` signature widened `data` to `unknown[]`, which
    // didn't satisfy `ApiCollectionEnvelope<ApiPatient>` when handed to
    // `listPatients.mockResolvedValue(...)`.
    const buildPatientsResponse = <T,>(patients: T[]) => ({
        data: patients,
        meta: {
            pagination: {
                page: 1,
                per_page: 10,
                total: patients.length,
                total_pages: 1,
            },
        },
    });

    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        pushMock.mockReset();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(clearRecentPatients).mockReset();
        vi.mocked(forgetRecentPatient).mockReset();
        vi.mocked(listPatients).mockReset();
        vi.mocked(listPatientCategories).mockReset();
        vi.mocked(listRecentPatients).mockReset();
        vi.mocked(restorePatient).mockReset();
        vi.mocked(getCurrentUser).mockResolvedValue({
            id: 'user-1',
            name: 'Dr. Test',
            email: 'doctor@example.test',
            role: 'dentist',
            account_status: 'active',
        });
        vi.mocked(listPatientCategories).mockResolvedValue([]);
        vi.mocked(listRecentPatients).mockResolvedValue([]);
        vi.mocked(forgetRecentPatient).mockResolvedValue(undefined);
        vi.mocked(clearRecentPatients).mockResolvedValue(undefined);
        vi.mocked(restorePatient).mockResolvedValue({
            id: 'restored',
            patient_id: 'PT-REST',
            full_name: 'Restored',
            phone: '+10000000000',
        } as never);
    });

    it('shows profile-based recent patients on empty search focus', async () => {
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([]));
        vi.mocked(listRecentPatients).mockResolvedValue([
            { id: 'recent-patient-1', full_name: 'Recent Patient One' },
        ]);
        vi.mocked(forgetRecentPatient).mockReturnValue(new Promise<void>(() => {}));

        renderPage();
        const user = userEvent.setup();

        const searchInput = await screen.findByLabelText('Search patients by name, phone, or patient ID');
        await user.click(searchInput);

        expect(await screen.findByText('Recent patients')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Recent Patient One' }));

        expect(pushMock).toHaveBeenCalledWith('/patients/recent-patient-1');
    });

    it('hides recent patients while searching and can remove recent shortcuts', async () => {
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([]));
        vi.mocked(listRecentPatients).mockResolvedValue([
            { id: 'recent-patient-1', full_name: 'Recent Patient One' },
        ]);

        renderPage();
        const user = userEvent.setup();

        const searchInput = await screen.findByLabelText('Search patients by name, phone, or patient ID');
        await user.click(searchInput);
        const menu = await screen.findByText('Recent patients');
        expect(menu).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Remove Recent Patient One from recent patients' }));
        expect(forgetRecentPatient).toHaveBeenCalledWith('recent-patient-1');
        await waitFor(() => {
            expect(screen.queryByText('Recent Patient One')).not.toBeInTheDocument();
        });

        await user.clear(searchInput);
        await user.type(searchInput, 'Ali');
        expect(screen.queryByText('Recent patients')).not.toBeInTheDocument();
    });

    it('clears all recent patient shortcuts from the search menu', async () => {
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([]));
        vi.mocked(listRecentPatients).mockResolvedValue([
            { id: 'recent-patient-1', full_name: 'Recent Patient One' },
        ]);
        vi.mocked(clearRecentPatients).mockReturnValue(new Promise<void>(() => {}));

        renderPage();
        const user = userEvent.setup();

        const searchInput = await screen.findByLabelText('Search patients by name, phone, or patient ID');
        await user.click(searchInput);

        const recentMenu = await screen.findByText('Recent patients');
        await user.click(within(recentMenu.parentElement as HTMLElement).getByRole('button', { name: 'Clear' }));

        expect(clearRecentPatients).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            expect(screen.queryByText('Recent patients')).not.toBeInTheDocument();
        });
    });

    it('shows inactive filter results and quick-schedule action', async () => {
        const recentVisit = new Date();
        recentVisit.setDate(recentVisit.getDate() - 10);
        const oldVisit = new Date();
        oldVisit.setMonth(oldVisit.getMonth() - 8);

        const allPatients = [
            {
                id: 'patient-inactive-never',
                patient_id: 'PT-1001AA',
                full_name: 'No Visit Patient',
                phone: '+10000000001',
                created_at: '2026-03-01T10:00:00Z',
                last_visit_at: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
            },
            {
                id: 'patient-active',
                patient_id: 'PT-1002BB',
                full_name: 'Recent Visit Patient',
                phone: '+10000000002',
                created_at: '2026-02-01T10:00:00Z',
                last_visit_at: recentVisit.toISOString().slice(0, 10),
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
            },
            {
                id: 'patient-inactive-old',
                patient_id: 'PT-1003CC',
                full_name: 'Old Visit Patient',
                phone: '+10000000003',
                created_at: '2026-01-01T10:00:00Z',
                last_visit_at: oldVisit.toISOString().slice(0, 10),
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
            },
        ];

        vi.mocked(listPatients).mockImplementation(async (options) => {
            const isInactiveOnly = Boolean(options?.filter?.inactive_before);
            const data = isInactiveOnly
                ? [allPatients[0], allPatients[2]]
                : allPatients;

            return buildPatientsResponse(data);
        });

        renderPage();
        const user = userEvent.setup();

        await waitFor(() => {
            expect(screen.getByText('No Visit Patient')).toBeInTheDocument();
            expect(screen.getByText('Recent Visit Patient')).toBeInTheDocument();
            expect(screen.getByText('Old Visit Patient')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('combobox', { name: /(Filter patients by visit gap|Фильтр пациентов по периоду без визита)/i }));
        await user.click(screen.getByRole('option', { name: /(No Visit 1Y|Без визита 1Г)/i }));

        await waitFor(() => {
            expect(screen.getByText('No Visit Patient')).toBeInTheDocument();
            expect(screen.getByText('Old Visit Patient')).toBeInTheDocument();
            expect(screen.queryByText('Recent Visit Patient')).not.toBeInTheDocument();
        });

        const scheduleButtons = screen.getAllByRole('button', { name: /(Schedule|Запланировать)/i });
        expect(scheduleButtons).toHaveLength(2);

        await user.click(scheduleButtons[0]);
        expect(pushMock).toHaveBeenCalledWith('/appointments?action=new&patientId=patient-inactive-never');
    });

    it('shows patients and routes to details from action button', async () => {
        const recentVisit = new Date();
        recentVisit.setDate(recentVisit.getDate() - 7);
        const oldVisit = new Date();
        oldVisit.setFullYear(oldVisit.getFullYear() - 2);

        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([
            {
                id: 'patient-followup',
                patient_id: 'PT-2001AA',
                full_name: 'Followup Needed',
                phone: '+10000000004',
                created_at: '2026-02-01T10:00:00Z',
                last_visit_at: oldVisit.toISOString().slice(0, 10),
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
            },
            {
                id: 'patient-active',
                patient_id: 'PT-2002BB',
                full_name: 'Healthy Active',
                phone: '+10000000005',
                created_at: '2026-01-01T10:00:00Z',
                last_visit_at: recentVisit.toISOString().slice(0, 10),
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
            },
        ]));

        renderPage();
        const user = userEvent.setup();

        await waitFor(() => {
            expect(screen.getByText('Followup Needed')).toBeInTheDocument();
            expect(screen.getByText('Healthy Active')).toBeInTheDocument();
        });

        const viewDetailsButtons = screen.getAllByRole('button', { name: /(Open|Открыть|Ko‘rish|Ko'rish)/i });
        await user.click(viewDetailsButtons[0]);

        expect(pushMock).toHaveBeenCalledWith('/patients/patient-followup');
    });

    it('opens a read-only preview from the patient photo thumbnail', async () => {
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([
            {
                id: 'patient-photo',
                patient_id: 'PT-4001AA',
                full_name: 'Photo Preview Patient',
                phone: '+10000000007',
                created_at: '2026-02-01T10:00:00Z',
                last_visit_at: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
                photo_url: 'https://media.example.test/patients/photo-original.webp',
                photo_thumbnail_url: 'https://media.example.test/patients/photo-thumb.webp',
                photo_preview_url: 'https://media.example.test/patients/photo-preview.webp',
                photo_thumbnail_ready: true,
                photo_preview_ready: true,
                photo_scan_status: 'approved',
            },
            {
                id: 'patient-without-photo',
                patient_id: 'PT-4002BB',
                full_name: 'No Photo Patient',
                phone: '+10000000008',
                created_at: '2026-02-02T10:00:00Z',
                last_visit_at: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
            },
        ]));

        renderPage();
        const user = userEvent.setup();

        const photoTrigger = await screen.findByRole('button', {
            name: 'Patient Photo: Photo Preview Patient',
        });
        expect(screen.queryByRole('button', { name: 'Patient Photo: No Photo Patient' })).not.toBeInTheDocument();
        expect(photoTrigger).toBeEnabled();

        await user.click(photoTrigger);

        expect(pushMock).not.toHaveBeenCalled();
        expect(photoTrigger).toHaveClass('h-16', 'w-16');
        const dialog = await screen.findByRole('dialog');
        expect(dialog).toBeInTheDocument();
        expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('shows record authors when the display preference is enabled', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
            id: 'user-1',
            name: 'Dr. Test',
            email: 'doctor@example.test',
            role: 'dentist',
            account_status: 'active',
            show_record_authors: true,
        });
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([
            {
                id: 'patient-authored',
                patient_id: 'PT-3001AA',
                full_name: 'Authored Patient',
                phone: '+10000000006',
                created_at: '2026-02-01T10:00:00Z',
                last_visit_at: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
                created_by: { id: 'staff-1', name: 'Front Desk', role: 'assistant' },
                updated_by: { id: 'staff-1', name: 'Front Desk', role: 'assistant' },
            },
        ]));

        renderPage();

        expect(await screen.findByText('by Front Desk')).toBeInTheDocument();
    });
});
