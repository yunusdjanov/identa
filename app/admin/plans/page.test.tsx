import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminPlansPage from '@/app/admin/plans/page';
import { getCurrentUser, listAdminPlans } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    listAdminPlans: vi.fn(),
    updateAdminPlan: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const admin = { id: 'a1', name: 'Super Admin', email: 'admin@identa.test', role: 'admin' as const, account_status: 'active' as const };

function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <AdminPlansPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('AdminPlansPage', () => {
    beforeEach(() => {
        pushMock.mockClear();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(listAdminPlans).mockResolvedValue([] as never);
    });
    afterEach(() => cleanup());

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

    it('renders the plans page for an admin', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        renderPage();
        // admin.plans.title (EN) = "Plans and limits"
        expect(await screen.findByText('Plans and limits')).toBeInTheDocument();
    });
});
