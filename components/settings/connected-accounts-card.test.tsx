import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectedAccountsCard } from '@/components/settings/connected-accounts-card';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { linkGoogleAccount, unlinkGoogleAccount } from '@/lib/api/dentist';

vi.mock('@/lib/api/dentist', () => ({
    linkGoogleAccount: vi.fn(),
    unlinkGoogleAccount: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const linkedUser = {
    id: '1',
    name: 'Demo Dentist',
    email: 'dentist@identa.test',
    role: 'dentist' as const,
    account_status: 'active' as const,
    has_password: true,
    google_linked: true,
};

function renderCard(user = linkedUser) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <ConnectedAccountsCard user={user} />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('ConnectedAccountsCard', () => {
    beforeEach(() => {
        vi.mocked(linkGoogleAccount).mockReset();
        vi.mocked(unlinkGoogleAccount).mockReset();
        vi.mocked(unlinkGoogleAccount).mockResolvedValue({
            ...linkedUser,
            google_linked: false,
        } as never);
    });

    afterEach(() => cleanup());

    it('confirms before disconnecting Google', async () => {
        renderCard();
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Disconnect' }));
        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Disconnect Google?')).toBeInTheDocument();
        expect(unlinkGoogleAccount).not.toHaveBeenCalled();

        await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
        await waitFor(() => expect(unlinkGoogleAccount).toHaveBeenCalledTimes(1));
    });

    it('does not offer disconnect when there is no password fallback', () => {
        renderCard({ ...linkedUser, has_password: false });

        expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument();
        expect(screen.getByText(/Set a password from Security/)).toBeInTheDocument();
    });
});
