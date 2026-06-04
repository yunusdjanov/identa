import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/app/settings/page';
import { getCurrentUser, getProfile } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const dentist = {
    id: '1',
    name: 'Demo Dentist',
    email: 'dentist@identa.test',
    role: 'dentist' as const,
    account_status: 'active' as const,
};

const profile = {
    id: '1',
    name: 'Demo Dentist',
    email: 'dentist@identa.test',
    phone: '+998901234567',
    practice_name: 'Demo Clinic',
    license_number: 'LIC-1',
    address: 'Tashkent',
    working_hours: { start: '09:00', end: '18:00' },
    default_appointment_duration: 30,
};

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <SettingsPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('SettingsPage', () => {
    beforeEach(() => {
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getProfile).mockReset();
        vi.mocked(getProfile).mockResolvedValue(profile as never);
    });

    afterEach(() => {
        cleanup();
    });

    it('shows an error state when the session fails to load', async () => {
        vi.mocked(getCurrentUser).mockRejectedValue(new Error('boom'));
        renderPage();
        expect(await screen.findByText('Could not load data')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('denies access to users who are neither dentist nor assistant', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ ...dentist, role: 'admin' } as never);
        renderPage();
        // settings.noAccess (EN) = "You do not have access to settings."
        expect(await screen.findByText('You do not have access to settings.')).toBeInTheDocument();
    });

    it('renders the settings workspace for a dentist', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        renderPage();
        // settings.subtitle (EN) = "Manage your profile and preferences"
        expect(await screen.findByText('Manage your profile and preferences')).toBeInTheDocument();
    });
});
