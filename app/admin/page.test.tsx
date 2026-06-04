import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDashboardPage from '@/app/admin/page';
import { getCurrentUser, listAdminDentists, listAdminPlans, updateAdminDentistStatus } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    listAdminDentists: vi.fn(),
    listAdminPlans: vi.fn(),
    getAdminDentistBilling: vi.fn(),
    createAdminDentist: vi.fn(),
    deleteAdminDentist: vi.fn(),
    restoreAdminDentist: vi.fn(),
    updateAdminDentistStatus: vi.fn(),
    resetAdminDentistPassword: vi.fn(),
    verifyAdminDentistEmail: vi.fn(),
    manageAdminDentistSubscription: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const admin = {
    id: 'admin-1',
    name: 'Super Admin',
    email: 'admin@identa.test',
    role: 'admin' as const,
    account_status: 'active' as const,
};

const dentistRow = {
    id: 'd-1',
    name: 'Dr Demo',
    email: 'demo@clinic.test',
    practice_name: 'Demo Clinic',
    status: 'active',
    registration_date: '2026-01-01T00:00:00Z',
    last_login: '2026-06-01T00:00:00Z',
    email_verified: true,
    subscription: null,
};

function accountsResponse(dentists: Array<typeof dentistRow>) {
    return {
        data: dentists,
        meta: {
            pagination: { current_page: 1, total_pages: 1, total: dentists.length, per_page: 10 },
            summary: {
                total_count: dentists.length,
                active_count: dentists.filter((d) => d.status === 'active').length,
                new_registrations_7d: 0,
            },
        },
    };
}

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
                <AdminDashboardPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('AdminDashboardPage', () => {
    beforeEach(() => {
        pushMock.mockClear();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(listAdminDentists).mockReset();
        vi.mocked(listAdminPlans).mockResolvedValue([]);
    });

    afterEach(() => {
        cleanup();
    });

    it('redirects non-admin users to the dentist dashboard', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ ...admin, role: 'dentist' } as never);
        renderPage();
        await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));
    });

    it('redirects to the admin login when the session is invalid', async () => {
        vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthenticated'));
        renderPage();
        await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/admin/login'));
    });

    it('shows an error state with retry when accounts fail to load', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        vi.mocked(listAdminDentists).mockRejectedValue(new Error('boom'));
        renderPage();

        // common.loadErrorTitle (EN) = "Could not load data"
        expect(await screen.findByText('Could not load data')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('renders dentist accounts and stats for an admin', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        vi.mocked(listAdminDentists).mockResolvedValue(accountsResponse([dentistRow]) as never);
        renderPage();

        // Email renders as its own text node (the name is split across the
        // "Dr." prefix + truncated name), so assert on the email.
        expect(await screen.findByText('demo@clinic.test')).toBeInTheDocument();
        // admin.stats.totalDentists (EN) = "Total Dentists"
        expect(screen.getByText('Total Dentists')).toBeInTheDocument();
        expect(pushMock).not.toHaveBeenCalled();
    });

    it('blocks an active dentist from the row action menu', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        vi.mocked(listAdminDentists).mockResolvedValue(accountsResponse([dentistRow]) as never);
        renderPage();
        const user = userEvent.setup();

        expect(await screen.findByText('demo@clinic.test')).toBeInTheDocument();

        // admin.rowActions (EN) = "Actions for {{name}}"
        await user.click(screen.getByRole('button', { name: 'Actions for Dr Demo' }));
        await user.click(await screen.findByRole('menuitem', { name: /Block Account/ }));

        expect(updateAdminDentistStatus).toHaveBeenCalledWith('d-1', 'blocked');
    });
});
