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
import {
    markPatientListStateForBackNavigation,
    PATIENTS_LIST_STATE_STORAGE_KEY,
} from '@/lib/patients/patient-list-state';

const pushMock = vi.fn();
const STALE_RESTORE_HISTORY_STATE_KEY = 'identaPatientsListRestore';

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: pushMock,
    }),
    useSearchParams: () => new URLSearchParams(window.location.search),
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

vi.mock('@/components/patients/patient-photo-preview-dialog', () => ({
    PatientPhotoPreviewDialog: (props: { open: boolean; title: string }) => (
        props.open ? <div role="dialog" aria-label={props.title} /> : null
    ),
}));

function createPatientsPageElement(queryClient: QueryClient) {
    return (
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <PatientsPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    const result = render(createPatientsPageElement(queryClient));

    return {
        ...result,
        rerenderPage: () => result.rerender(createPatientsPageElement(queryClient)),
    };
}

describe('PatientsPage', () => {
    // Generic so the return type carries the patient type forward. The
    // earlier `unknown[]` signature widened `data` to `unknown[]`, which
    // didn't satisfy `ApiCollectionEnvelope<ApiPatient>` when handed to
    // `listPatients.mockResolvedValue(...)`.
    const buildPatientsResponse = <T,>(
        patients: T[],
        pagination?: Partial<{ page: number; per_page: number; total: number; total_pages: number }>
    ) => ({
        data: patients,
        meta: {
            pagination: {
                page: pagination?.page ?? 1,
                per_page: pagination?.per_page ?? 10,
                total: pagination?.total ?? patients.length,
                total_pages: pagination?.total_pages ?? 1,
            },
        },
    });

    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        pushMock.mockReset();
        window.sessionStorage.clear();
        window.history.replaceState({}, '', '/patients');
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

    it('restores the previous page and focused patient after returning from details', async () => {
        window.history.replaceState({}, '', '/patients?restore=1');
        markPatientListStateForBackNavigation({
            searchQuery: 'Restored',
            inactiveFilter: 'none',
            showArchivedOnly: false,
            selectedCategoryId: 'all',
            currentPage: 2,
            focusPatientId: 'patient-restored',
        });
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([
            {
                id: 'patient-restored',
                patient_id: 'PT-REST',
                full_name: 'Restored Patient',
                phone: '+10000000010',
                created_at: '2026-02-01T10:00:00Z',
                updated_at: '2026-02-02T10:00:00Z',
                last_visit_at: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
            },
        ], { page: 2, total: 11, total_pages: 2 }));

        renderPage();

        expect(await screen.findByText('Restored Patient')).toBeInTheDocument();
        await waitFor(() => {
            expect(listPatients).toHaveBeenCalledWith(expect.objectContaining({
                page: 2,
                sort: '-updated_at',
                filter: expect.objectContaining({
                    search: 'Restored',
                }),
            }));
        });
        expect(screen.getByTestId('patient-row-patient-restored')).toHaveClass('bg-teal-50/60');
    });

    it('restores the previous page when the router reuses the patients page instance', async () => {
        window.history.replaceState({}, '', '/patients');
        vi.mocked(listPatients).mockImplementation(async (options) => {
            const page = options?.page ?? 1;

            if (page === 2) {
                return buildPatientsResponse([
                    {
                        id: 'patient-restored',
                        patient_id: 'PT-REST',
                        full_name: 'Restored Patient',
                        phone: '+10000000010',
                        created_at: '2026-02-01T10:00:00Z',
                        updated_at: '2026-02-02T10:00:00Z',
                        last_visit_at: null,
                        address: null,
                        date_of_birth: null,
                        gender: null,
                        medical_history: null,
                        allergies: null,
                        current_medications: null,
                    },
                ], { page: 2, total: 11, total_pages: 2 });
            }

            return buildPatientsResponse([
                {
                    id: 'patient-default',
                    patient_id: 'PT-DEFAULT',
                    full_name: 'Default Patient',
                    phone: '+10000000011',
                    created_at: '2026-02-01T10:00:00Z',
                    updated_at: '2026-02-02T10:00:00Z',
                    last_visit_at: null,
                    address: null,
                    date_of_birth: null,
                    gender: null,
                    medical_history: null,
                    allergies: null,
                    current_medications: null,
                },
            ], { page: 1, total: 11, total_pages: 2 });
        });

        const { rerenderPage } = renderPage();

        expect(await screen.findByText('Default Patient')).toBeInTheDocument();

        markPatientListStateForBackNavigation({
            searchQuery: '',
            inactiveFilter: 'none',
            showArchivedOnly: false,
            selectedCategoryId: 'all',
            currentPage: 2,
            focusPatientId: 'patient-restored',
        });
        window.history.replaceState({}, '', '/patients?restore=1');
        rerenderPage();

        expect(await screen.findByText('Restored Patient')).toBeInTheDocument();
        await waitFor(() => {
            expect(listPatients).toHaveBeenCalledWith(expect.objectContaining({
                page: 2,
                sort: '-updated_at',
            }));
        });
        expect(screen.getByTestId('patient-row-patient-restored')).toHaveClass('bg-teal-50/60');
        expect(window.location.search).toBe('');
    });

    it('ignores stale patient list state on normal menu navigation', async () => {
        window.sessionStorage.setItem(PATIENTS_LIST_STATE_STORAGE_KEY, JSON.stringify({
            searchQuery: 'Restored',
            inactiveFilter: 'none',
            showArchivedOnly: false,
            selectedCategoryId: 'all',
            currentPage: 2,
            focusPatientId: 'patient-restored',
        }));
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([
            {
                id: 'patient-default',
                patient_id: 'PT-DEFAULT',
                full_name: 'Default Patient',
                phone: '+10000000011',
                created_at: '2026-02-01T10:00:00Z',
                updated_at: '2026-02-02T10:00:00Z',
                last_visit_at: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
            },
        ], { page: 1, total: 1, total_pages: 1 }));

        renderPage();

        expect(await screen.findByText('Default Patient')).toBeInTheDocument();
        await waitFor(() => {
            expect(listPatients).toHaveBeenCalledWith(expect.objectContaining({
                page: 1,
                sort: '-updated_at',
                filter: expect.not.objectContaining({
                    search: 'Restored',
                }),
            }));
        });
        expect(screen.getByTestId('patient-row-patient-default')).not.toHaveClass('bg-teal-50/60');
    });

    it('ignores stale browser restore markers unless the detail arrow restore URL is used', async () => {
        window.history.replaceState({ [STALE_RESTORE_HISTORY_STATE_KEY]: true }, '', '/patients');
        window.sessionStorage.setItem(PATIENTS_LIST_STATE_STORAGE_KEY, JSON.stringify({
            searchQuery: 'Restored',
            inactiveFilter: 'none',
            showArchivedOnly: false,
            selectedCategoryId: 'all',
            currentPage: 2,
            focusPatientId: 'patient-restored',
        }));
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([
            {
                id: 'patient-default',
                patient_id: 'PT-DEFAULT',
                full_name: 'Default Patient',
                phone: '+10000000011',
                created_at: '2026-02-01T10:00:00Z',
                updated_at: '2026-02-02T10:00:00Z',
                last_visit_at: null,
                address: null,
                date_of_birth: null,
                gender: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
            },
        ], { page: 1, total: 1, total_pages: 1 }));

        renderPage();

        expect(await screen.findByText('Default Patient')).toBeInTheDocument();
        await waitFor(() => {
            expect(listPatients).toHaveBeenCalledWith(expect.objectContaining({
                page: 1,
                sort: '-updated_at',
                filter: expect.not.objectContaining({
                    search: 'Restored',
                }),
            }));
        });
        expect(screen.getByTestId('patient-row-patient-default')).not.toHaveClass('bg-teal-50/60');
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
        const recentMenu = screen.getByTestId('patients-recent-menu');
        expect(recentMenu).toHaveClass('left-0', 'w-full');
        expect(recentMenu.className).not.toContain('max-w');
        await user.click(screen.getByRole('button', { name: 'Recent Patient One' }));

        expect(pushMock).toHaveBeenCalledWith('/patients/recent-patient-1?remember_recent=1');
    });

    it('renders search and filters inside the patients list card', async () => {
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([
            {
                id: 'patient-list-card',
                patient_id: 'PT-LIST',
                full_name: 'List Card Patient',
                phone: '+10000000012',
                created_at: '2026-02-01T10:00:00Z',
                updated_at: '2026-02-02T10:00:00Z',
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

        const listCard = await screen.findByTestId('patients-list-card');
        const toolbar = within(listCard).getByTestId('patients-filter-toolbar');

        expect(within(listCard).getByText('Patients: 1')).toBeInTheDocument();
        expect(within(toolbar).getByLabelText('Search patients by name, phone, or patient ID')).toBeInTheDocument();
        expect(within(toolbar).getByRole('combobox', { name: 'Filter patients by category' })).toBeInTheDocument();
        expect(within(toolbar).getByRole('combobox', { name: 'Filter patients by visit gap' })).toBeInTheDocument();
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
        expect(searchInput).toHaveAttribute('aria-expanded', 'true');

        await user.keyboard('{Escape}');
        expect(screen.queryByText('Recent patients')).not.toBeInTheDocument();

        await user.click(searchInput);
        expect(await screen.findByText('Recent patients')).toBeInTheDocument();

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

    it('records recent patients only when opening them from search', async () => {
        vi.mocked(listPatients).mockResolvedValue(buildPatientsResponse([
            {
                id: 'search-patient',
                patient_id: 'PT-SEARCH',
                full_name: 'Search Result Patient',
                phone: '+10000000009',
                created_at: '2026-03-01T10:00:00Z',
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

        const searchInput = await screen.findByLabelText('Search patients by name, phone, or patient ID');
        await screen.findByText('Search Result Patient');

        await user.click(screen.getByText('Search Result Patient'));
        expect(pushMock).toHaveBeenLastCalledWith('/patients/search-patient');

        await user.click(searchInput);
        await user.type(searchInput, 'Search');
        await user.click(screen.getByText('Search Result Patient'));
        expect(pushMock).toHaveBeenLastCalledWith('/patients/search-patient?remember_recent=1');

        await user.clear(searchInput);
        await user.click(searchInput);

        expect(await screen.findByText('Recent patients')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Search Result Patient' })).toBeInTheDocument();
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
        const selectContent = document.querySelector('[data-slot="select-content"]') as HTMLElement | null;
        expect(selectContent).toHaveClass('w-[var(--radix-select-trigger-width)]');
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

        expect(screen.queryByRole('button', { name: /^History$/i })).not.toBeInTheDocument();

        const viewDetailsButtons = screen.getAllByRole('button', { name: /(Open|Открыть|Ko‘rish|Ko'rish)/i });
        await user.click(viewDetailsButtons[0]);

        expect(pushMock).toHaveBeenCalledWith('/patients/patient-followup');
        expect(JSON.parse(window.sessionStorage.getItem(PATIENTS_LIST_STATE_STORAGE_KEY) ?? '{}')).toMatchObject({
            currentPage: 1,
            focusPatientId: 'patient-followup',
        });
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
        expect(within(photoTrigger).getByRole('img', { name: 'Photo Preview Patient' }))
            .toHaveClass('h-full', 'w-full', 'object-cover');

        await user.click(photoTrigger);

        expect(pushMock).not.toHaveBeenCalled();
        expect(photoTrigger).toHaveClass('h-20', 'w-20', 'absolute');
        expect(photoTrigger.parentElement).toHaveClass('h-16', 'w-20');
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
