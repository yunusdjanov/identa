import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StaffPage from '@/app/staff/page';
import { getCurrentUser } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => '/staff',
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
}));

// The staff page mounts data-fetching tab components on success; stub them so
// the test focuses on the page's own gating + header.
vi.mock('@/components/settings/team-access-tab', () => ({
    TeamAccessTab: () => <div>team-access-tab</div>,
}));
vi.mock('@/components/settings/audit-logs-tab', () => ({
    AuditLogsTab: () => <div>audit-logs-tab</div>,
}));

const dentist = {
    id: '1',
    name: 'Demo Dentist',
    email: 'dentist@identa.test',
    role: 'dentist' as const,
    account_status: 'active' as const,
};

function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <StaffPage />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('StaffPage', () => {
    beforeEach(() => {
        vi.mocked(getCurrentUser).mockReset();
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

    it('denies access to non-dentist (assistant) accounts', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ ...dentist, role: 'assistant' } as never);
        renderPage();
        // settings.team.noAccess (EN) = "You do not have permission to manage staff."
        expect(await screen.findByText('You do not have permission to manage staff.')).toBeInTheDocument();
    });

    it('renders the staff workspace for a dentist', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        renderPage();
        // staff.subtitle (EN) = "Manage staff and action logs"
        expect(await screen.findByText('Manage staff and action logs')).toBeInTheDocument();
        expect(screen.getByText('team-access-tab')).toBeInTheDocument();
    });
});
