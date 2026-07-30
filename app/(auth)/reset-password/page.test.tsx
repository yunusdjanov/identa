import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResetPasswordPage from '@/app/(auth)/reset-password/page';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams('token=reset-token&email=user@identa.test'),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/api/dentist', () => ({
    resetPasswordWithToken: vi.fn(),
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
    afterEach(() => cleanup());

    it('renders the new-password form', async () => {
        renderPage();
        // resetPassword.title (EN) = "Set a new password"
        expect(await screen.findByText('Set a new password')).toBeInTheDocument();
    });
});
