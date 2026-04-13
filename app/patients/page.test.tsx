import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PatientsPage from '@/app/patients/page';
import { listPatientCategories, listPatients, restorePatient } from '@/lib/api/dentist';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: pushMock,
    }),
}));

vi.mock('@/lib/api/dentist', () => ({
    listPatients: vi.fn(),
    listPatientCategories: vi.fn(),
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
            <PatientsPage />
        </QueryClientProvider>
    );
}

describe('PatientsPage', () => {
    const buildPatientsResponse = (patients: unknown[]) => ({
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
        vi.mocked(listPatients).mockReset();
        vi.mocked(listPatientCategories).mockReset();
        vi.mocked(restorePatient).mockReset();
        vi.mocked(listPatientCategories).mockResolvedValue([]);
        vi.mocked(restorePatient).mockResolvedValue({
            id: 'restored',
            patient_id: 'PT-REST',
            full_name: 'Restored',
            phone: '+10000000000',
        } as never);
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
});

