import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminHeader } from '@/components/admin/admin-header';
import { AppLayout } from '@/components/layout/app-layout';

const queryState = vi.hoisted(() => ({
    current: {
        data: undefined as undefined | {
            id: string;
            name: string;
            email: string;
            role: 'dentist';
            account_status: 'active';
            email_verified?: boolean;
        },
        isLoading: true,
        isError: false,
        error: null,
    },
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: () => queryState.current,
    useQueryClient: () => ({
        clear: vi.fn(),
    }),
}));

vi.mock('next/navigation', () => ({
    usePathname: () => '/payments',
    useRouter: () => ({
        replace: vi.fn(),
    }),
}));

vi.mock('@/lib/store', () => ({
    useAuthStore: (selector?: (state: { isLoggingOut: boolean; dentistName: string; logout: () => void }) => unknown) => {
        const state = {
            isLoggingOut: false,
            dentistName: '',
            logout: vi.fn(),
        };

        return typeof selector === 'function' ? selector(state) : state;
    },
}));

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
}));

vi.mock('@/components/providers/i18n-provider', () => ({
    useI18n: () => ({
        locale: 'ru',
        t: (key: string) => key,
    }),
}));

vi.mock('@/components/layout/language-switcher', () => ({
    LanguageSwitcher: () => null,
}));

vi.mock('@/components/layout/subscription-banner', () => ({
    SubscriptionBanner: () => null,
}));

vi.mock('@/components/layout/email-verification-banner', () => ({
    EmailVerificationBanner: () => null,
}));

vi.mock('@/components/layout/account-menu', () => ({
    AccountMenu: () => null,
}));

vi.mock('@/components/branding/brand', () => ({
    Brand: () => <div data-testid="brand" />,
}));

vi.mock('@/lib/auth/use-instant-logout', () => ({
    useInstantLogout: () => vi.fn(),
}));

vi.mock('@/lib/auth/auth-broadcast', () => ({
    subscribeAuthBroadcast: () => vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
    },
}));

describe('AppLayout skeleton header', () => {
    beforeEach(() => {
        queryState.current = {
            data: undefined,
            isLoading: true,
            isError: false,
            error: null,
        };
    });

    afterEach(() => {
        cleanup();
    });

    it('matches the current four-item app navigation while auth is loading', () => {
        render(
            <AppLayout>
                <div>Protected content</div>
            </AppLayout>
        );

        expect(screen.getAllByTestId('app-header-desktop-nav-skeleton-item')).toHaveLength(4);
        expect(screen.getAllByTestId('app-header-mobile-nav-skeleton-item')).toHaveLength(4);
        expect(screen.getAllByTestId('app-header-mobile-nav-skeleton-item')[0].parentElement)
            .toHaveClass('justify-start', 'overflow-x-auto');
    });

    it('keeps the app header above page-level select popovers', () => {
        const { container } = render(
            <AppLayout>
                <div>Protected content</div>
            </AppLayout>
        );

        expect(container.querySelector('header')).toHaveClass('fixed', 'z-50');
        expect(container.querySelector('header')).toHaveAttribute('data-app-header');
        expect(container.querySelector('[data-app-header] > div')).toHaveClass('max-w-[1600px]');
        expect(container.querySelector('main')).toHaveClass('max-w-[1600px]');
        expect(container.querySelector('[data-app-header-spacer]')).toHaveClass('h-[7.5rem]', 'md:h-16');
    });

    it('keeps the admin header fixed above page-level select popovers', () => {
        const { container } = render(<AdminHeader active="dashboard" onLogout={vi.fn()} />);

        expect(container.querySelector('header')).toHaveClass('fixed', 'z-50');
        expect(container.querySelector('header > div')).toHaveClass('max-w-[1600px]');
        expect(container.querySelector('[data-admin-header-spacer]')).toHaveClass('h-[7.5rem]', 'md:h-16');
    });

    it('gives icon-only tablet navigation an accessible name and current-page state', () => {
        queryState.current = {
            data: {
                id: 'dentist-1',
                name: 'Demo Dentist',
                email: 'dentist@identa.test',
                role: 'dentist',
                account_status: 'active',
            },
            isLoading: false,
            isError: false,
            error: null,
        };

        render(
            <AppLayout>
                <div>Protected content</div>
            </AppLayout>
        );

        const paymentLinks = screen.getAllByRole('link', { name: 'nav.payments' });
        expect(paymentLinks).toHaveLength(2);
        expect(paymentLinks.every((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
        expect(screen.getAllByRole('link', { name: 'nav.dashboard' })).toHaveLength(2);
    });

    it('lets keyboard users bypass protected and admin navigation', () => {
        queryState.current = {
            data: {
                id: 'dentist-1',
                name: 'Demo Dentist',
                email: 'dentist@identa.test',
                role: 'dentist',
                account_status: 'active',
            },
            isLoading: false,
            isError: false,
            error: null,
        };

        const { unmount } = render(
            <AppLayout>
                <div>Protected content</div>
            </AppLayout>
        );

        expect(screen.getByRole('link', { name: 'common.skipToContent' }))
            .toHaveAttribute('href', '#main-content');
        expect(document.querySelector('main')).toHaveAttribute('id', 'main-content');
        unmount();

        render(<AdminHeader active="dashboard" onLogout={vi.fn()} />);
        expect(screen.getByRole('link', { name: 'common.skipToContent' }))
            .toHaveAttribute('href', '#main-content');
    });

    it('blocks practice content until the email is verified', () => {
        queryState.current = {
            data: {
                id: 'dentist-1',
                name: 'Demo Dentist',
                email: 'dentist@identa.test',
                role: 'dentist',
                account_status: 'active',
                email_verified: false,
            },
            isLoading: false,
            isError: false,
            error: null,
        };

        render(
            <AppLayout>
                <div>Protected content</div>
            </AppLayout>
        );

        expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
        expect(screen.getByText('verifyEmail.gate.title')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'verifyEmail.gate.action' }))
            .toHaveAttribute('href', '/settings');
    });
});
