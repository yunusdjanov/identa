import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordPage from '@/app/(auth)/forgot-password/page';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const navigationMocks = vi.hoisted(() => ({
    searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
    useSearchParams: () => navigationMocks.searchParams,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/api/dentist', () => ({
    requestPasswordReset: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <ForgotPasswordPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('ForgotPasswordPage', () => {
    afterEach(() => {
        cleanup();
        navigationMocks.searchParams = new URLSearchParams();
    });

    it('renders the reset-request form', async () => {
        renderPage();
        // forgotPassword.title (EN) = "Reset password"
        expect(await screen.findByText('Reset password')).toBeInTheDocument();
    });

    it('returns an admin reset request to the admin login page', async () => {
        navigationMocks.searchParams = new URLSearchParams('from=admin');
        renderPage();

        expect(await screen.findByRole('link', { name: 'Back to sign in' }))
            .toHaveAttribute('href', '/admin/login');
    });
});
