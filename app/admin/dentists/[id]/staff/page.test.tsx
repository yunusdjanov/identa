import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDentistStaffPage from '@/app/admin/dentists/[id]/staff/page';
import { getCurrentUser, getAdminDentist, listAdminDentistStaff } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
    useParams: () => ({ id: 'd-1' }),
    useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn() }),
}));
vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    getAdminDentist: vi.fn(),
    listAdminDentistStaff: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const admin = { id: 'a1', name: 'Super Admin', email: 'admin@identa.test', role: 'admin' as const, account_status: 'active' as const };
const dentist = { id: 'd-1', name: 'Demo Owner', email: 'owner@clinic.test', status: 'active' };
const staffResponse = {
    data: [],
    meta: { pagination: { current_page: 1, total_pages: 1, total: 0, per_page: 20 }, summary: { total: 0, active: 0, blocked: 0 } },
};

function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <AdminDentistStaffPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('AdminDentistStaffPage', () => {
    beforeEach(() => {
        replaceMock.mockClear();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getAdminDentist).mockReset();
        vi.mocked(listAdminDentistStaff).mockResolvedValue(staffResponse as never);
    });
    afterEach(() => cleanup());

    it('redirects non-admin users to the dentist dashboard', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ ...admin, role: 'dentist' } as never);
        vi.mocked(getAdminDentist).mockResolvedValue(dentist as never);
        renderPage();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
    });

    it('redirects to the admin login when the session is invalid', async () => {
        vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthenticated'));
        renderPage();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/admin/login'));
    });

    it('renders the dentist staff page for an admin', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        vi.mocked(getAdminDentist).mockResolvedValue(dentist as never);
        renderPage();
        // admin.staffPage.subtitle (EN) = "Staff members attached to this dentist account."
        expect(
            await screen.findByText('Staff members attached to this dentist account.')
        ).toBeInTheDocument();
    });

    it('shows permission names and forced password-reset status', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        vi.mocked(getAdminDentist).mockResolvedValue(dentist as never);
        vi.mocked(listAdminDentistStaff).mockResolvedValue({
            data: [{
                id: 'staff-1',
                name: 'Assistant One',
                email: 'assistant@clinic.test',
                phone: null,
                avatar_url: null,
                account_status: 'active',
                assistant_permissions: ['patients.view', 'payments.manage'],
                must_change_password: true,
                last_login_at: null,
                created_at: '2026-06-01T00:00:00Z',
            }],
        } as never);

        renderPage();

        expect((await screen.findAllByText('Patients: view')).length).toBeGreaterThan(0);
        expect(screen.getAllByText('Finance: manage').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Password change required').length).toBeGreaterThan(0);
    });
});
