import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/login/page';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { useAuthStore } from '@/lib/store';
import { getCurrentUser, loginWithPassword } from '@/lib/api/dentist';

const GOOGLE_GSI_SCRIPT_SELECTOR = 'script[src="https://accounts.google.com/gsi/client"]';
const navigationMocks = vi.hoisted(() => ({
    push: vi.fn(),
    replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: navigationMocks.push,
        replace: navigationMocks.replace,
    }),
}));

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn().mockRejectedValue(new Error('Unauthenticated')),
    loginWithGoogleIdToken: vi.fn(),
    loginWithPassword: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
    },
}));

function renderLoginPage() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <LoginPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('LoginPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getCurrentUser).mockClear();
        useAuthStore.getState().logout();
        window.sessionStorage.clear();
        window.history.replaceState({}, '', '/login');
    });

    afterEach(() => {
        cleanup();
        document.querySelectorAll(GOOGLE_GSI_SCRIPT_SELECTOR).forEach((script) => script.remove());
        vi.unstubAllEnvs();
    });

    it('does not probe the current session for a guest login page visit', async () => {
        renderLoginPage();

        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();

        await new Promise((resolve) => window.setTimeout(resolve, 25));

        expect(getCurrentUser).not.toHaveBeenCalled();
    });

    it('loads the Google sign-in script only after the Google button is requested', async () => {
        vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'google-client-id');
        const user = userEvent.setup();
        renderLoginPage();

        expect(document.querySelector(GOOGLE_GSI_SCRIPT_SELECTOR)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

        await waitFor(() => {
            expect(document.querySelector(GOOGLE_GSI_SCRIPT_SELECTOR)).toBeInTheDocument();
        });
    });

    it('returns to a safe protected destination after password login', async () => {
        window.history.replaceState(
            {},
            '',
            '/login?from=%2Fpatients%2F42%3Ftab%3Dhistory'
        );
        vi.mocked(loginWithPassword).mockResolvedValue({
            id: 'dentist-1',
            name: 'Demo Dentist',
            email: 'dentist@identa.test',
            role: 'dentist',
            account_status: 'active',
        });
        const user = userEvent.setup();
        renderLoginPage();

        await user.type(screen.getByLabelText(/email/i), 'dentist@identa.test');
        await user.type(screen.getByLabelText(/^password/i), 'correct-password');
        await user.click(screen.getByRole('button', { name: /sign in/i }));

        await waitFor(() => {
            expect(navigationMocks.push).toHaveBeenCalledWith('/patients/42?tab=history');
        });
    });
});
