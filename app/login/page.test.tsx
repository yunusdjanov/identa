import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '@/app/login/page';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { useAuthStore } from '@/lib/store';
import { getCurrentUser } from '@/lib/api/dentist';

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
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
        vi.mocked(getCurrentUser).mockClear();
        useAuthStore.getState().logout();
        window.sessionStorage.clear();
    });

    afterEach(() => {
        cleanup();
    });

    it('does not probe the current session for a guest login page visit', async () => {
        renderLoginPage();

        expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();

        await new Promise((resolve) => window.setTimeout(resolve, 25));

        expect(getCurrentUser).not.toHaveBeenCalled();
    });
});
