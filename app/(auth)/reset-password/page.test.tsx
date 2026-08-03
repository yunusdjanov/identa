import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResetPasswordPage from '@/app/(auth)/reset-password/page';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const navigationMocks = vi.hoisted(() => ({
    searchParams: new URLSearchParams('token=reset-token&email=user@identa.test'),
    push: vi.fn(),
}));
const apiMocks = vi.hoisted(() => ({
    resetPasswordWithToken: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useSearchParams: () => navigationMocks.searchParams,
    useRouter: () => ({ push: navigationMocks.push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/api/dentist', () => ({
    resetPasswordWithToken: apiMocks.resetPasswordWithToken,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <ResetPasswordPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('ResetPasswordPage', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
        navigationMocks.searchParams = new URLSearchParams('token=reset-token&email=user@identa.test');
    });

    it('renders the new-password form', async () => {
        renderPage();
        // resetPassword.title (EN) = "Set a new password"
        expect(await screen.findByText('Set a new password')).toBeInTheDocument();
    });

    it('returns an admin password reset to the admin login page', async () => {
        navigationMocks.searchParams = new URLSearchParams(
            'token=reset-token&email=admin@identa.test&from=admin'
        );
        renderPage();

        expect(await screen.findByRole('link', { name: 'Back to sign in' }))
            .toHaveAttribute('href', '/admin/login');
    });

    it('redirects a completed admin reset to the admin login page', async () => {
        navigationMocks.searchParams = new URLSearchParams(
            'token=reset-token&email=admin@identa.test&from=admin'
        );
        apiMocks.resetPasswordWithToken.mockResolvedValue('Password reset completed.');
        const user = userEvent.setup();
        renderPage();

        await user.type(screen.getByLabelText(/^password \*/i), 'SecurePass123!');
        await user.type(screen.getByLabelText(/confirm password/i), 'SecurePass123!');
        await user.click(screen.getByRole('button', { name: 'Save new password' }));

        await waitFor(() => {
            expect(navigationMocks.push).toHaveBeenCalledWith('/admin/login');
        });
    });

    it('requires the stronger password policy for an admin reset link', async () => {
        navigationMocks.searchParams = new URLSearchParams(
            'token=reset-token&email=admin@identa.test&from=admin'
        );
        const user = userEvent.setup();
        renderPage();

        await user.type(screen.getByLabelText(/^password \*/i), 'securepass123');
        await user.type(screen.getByLabelText(/confirm password/i), 'securepass123');
        await user.click(screen.getByRole('button', { name: 'Save new password' }));

        expect(await screen.findByText(/admin password must include lowercase and uppercase/i))
            .toBeInTheDocument();
        expect(apiMocks.resetPasswordWithToken).not.toHaveBeenCalled();
    });
});
