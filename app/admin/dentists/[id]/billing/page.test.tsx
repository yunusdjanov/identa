import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminDentistBillingPage from '@/app/admin/dentists/[id]/billing/page';
import { getCurrentUser, getAdminDentistBilling, listAdminPlans } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
    useParams: () => ({ id: 'd-1' }),
    useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn() }),
}));
vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    getAdminDentistBilling: vi.fn(),
    listAdminPlans: vi.fn(),
    manageAdminDentistSubscription: vi.fn(),
    updateAdminDentistStatus: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const admin = { id: 'a1', name: 'Super Admin', email: 'admin@identa.test', role: 'admin' as const, account_status: 'active' as const };

function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <AdminDentistBillingPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('AdminDentistBillingPage', () => {
    beforeEach(() => {
        replaceMock.mockClear();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getAdminDentistBilling).mockReset();
        vi.mocked(listAdminPlans).mockResolvedValue([] as never);
    });
    afterEach(() => cleanup());

    it('redirects non-admin users away', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ ...admin, role: 'dentist' } as never);
        vi.mocked(getAdminDentistBilling).mockResolvedValue({} as never);
        renderPage();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    });

    it('redirects to login when the session is invalid', async () => {
        vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthenticated'));
        renderPage();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
    });

    it('shows an error state with retry when the billing data fails to load', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        vi.mocked(getAdminDentistBilling).mockRejectedValue(new Error('boom'));
        renderPage();
        expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
});
