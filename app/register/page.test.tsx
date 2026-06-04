import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from '@/app/register/page';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/lib/api/dentist', () => ({
    registerWithPassword: vi.fn(),
    loginWithGoogleIdToken: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <RegisterPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('RegisterPage', () => {
    afterEach(() => cleanup());

    it('renders the registration card', async () => {
        renderPage();
        // register.cardTitle (EN) = "Start with Identa"
        expect(await screen.findByText('Start with Identa')).toBeInTheDocument();
    });
});
