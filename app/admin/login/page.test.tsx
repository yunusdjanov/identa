import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLoginPage from '@/app/admin/login/page';
import { getCurrentUser } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const { ensureCsrfCookieMock, replaceMock } = vi.hoisted(() => ({
    ensureCsrfCookieMock: vi.fn(),
    replaceMock: vi.fn(),
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn() }),
}));
vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    loginWithPassword: vi.fn(),
    logoutSession: vi.fn(),
}));
vi.mock('@/lib/api/client', () => ({
    ensureCsrfCookie: ensureCsrfCookieMock,
    getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const admin = { id: 'a1', name: 'Super Admin', email: 'admin@identa.test', role: 'admin' as const, account_status: 'active' as const };

function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <AdminLoginPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('AdminLoginPage', () => {
    beforeEach(() => {
        replaceMock.mockClear();
        ensureCsrfCookieMock.mockReset();
        ensureCsrfCookieMock.mockResolvedValue(undefined);
        vi.mocked(getCurrentUser).mockReset();
    });
    afterEach(() => cleanup());

    it('renders the admin sign-in form for a guest', async () => {
        vi.mocked(getCurrentUser).mockRejectedValue(new Error('Unauthenticated'));
        renderPage();
        // admin.login.signInTitle (EN) = "Admin Sign In"
        expect(await screen.findByText('Admin Sign In')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Forgot password?' }))
            .toHaveAttribute('href', '/forgot-password?from=admin');
        expect(ensureCsrfCookieMock).toHaveBeenCalledOnce();
    });

    it('waits for the guest auth check before bootstrapping CSRF', async () => {
        let finishAuthCheck: (() => void) | undefined;
        vi.mocked(getCurrentUser).mockImplementation(() => new Promise((_, reject) => {
            finishAuthCheck = () => reject(new Error('Unauthenticated'));
        }));

        renderPage();
        expect(ensureCsrfCookieMock).not.toHaveBeenCalled();

        finishAuthCheck?.();
        await screen.findByText('Admin Sign In');
        await waitFor(() => expect(ensureCsrfCookieMock).toHaveBeenCalledOnce());
    });

    it('redirects an already-authenticated admin to the console', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
        renderPage();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/admin'));
    });

    it('redirects a forced-reset admin to password settings', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
            ...admin,
            must_change_password: true,
        } as never);
        renderPage();
        await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(
            '/admin/settings?forceReset=1'
        ));
    });
});
