import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminSettingsPage from '@/app/admin/settings/page';
import { getCurrentUser } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    updateProfile: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// PasswordSecurityCard fetches/mutates on mount; stub it so the test focuses
// on the admin-settings page's own auth gating + header.
vi.mock('@/components/settings/password-security-card', () => ({
    PasswordSecurityCard: () => <div>password-security-card</div>,
}));

const admin = { id: 'a1', name: 'Super Admin', email: 'admin@identa.test', role: 'admin' as const, account_status: 'active' as const };

function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <AdminSettingsPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('AdminSettingsPage', () => {
    beforeEach(() => {
        pushMock.mockClear();
        vi.mocked(getCurrentUser).mockReset();
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

    it('renders the admin settings page for an admin', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        renderPage();
        // admin.settings.title (EN) = "Admin Settings"
        expect(await screen.findByText('Admin Settings')).toBeInTheDocument();
    });

    it('limits a forced-reset admin to password security', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
            ...admin,
            must_change_password: true,
        } as never);
        renderPage();

        expect(await screen.findByText('Password change required')).toBeInTheDocument();
        expect(screen.queryByText('Account')).not.toBeInTheDocument();
        expect(screen.getByText('password-security-card')).toBeInTheDocument();
    });
});
