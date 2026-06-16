import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const GOOGLE_GSI_SCRIPT_SELECTOR = 'script[src="https://accounts.google.com/gsi/client"]';

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
    afterEach(() => {
        cleanup();
        document.querySelectorAll(GOOGLE_GSI_SCRIPT_SELECTOR).forEach((script) => script.remove());
        vi.unstubAllEnvs();
    });

    it('renders the registration card', async () => {
        renderPage();
        // register.cardTitle (EN) = "Start with Identa"
        expect(await screen.findByText('Start with Identa')).toBeInTheDocument();
    });

    it('loads the Google sign-up script only after the Google button is requested', async () => {
        vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'google-client-id');
        const user = userEvent.setup();
        renderPage();

        expect(document.querySelector(GOOGLE_GSI_SCRIPT_SELECTOR)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

        await waitFor(() => {
            expect(document.querySelector(GOOGLE_GSI_SCRIPT_SELECTOR)).toBeInTheDocument();
        });
    });
});
