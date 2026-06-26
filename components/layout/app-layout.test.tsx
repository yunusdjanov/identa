import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppLayout } from '@/components/layout/app-layout';

vi.mock('@tanstack/react-query', () => ({
    useQuery: () => ({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
    }),
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
    afterEach(() => {
        cleanup();
    });

    it('matches the current five-item app navigation while auth is loading', () => {
        render(
            <AppLayout>
                <div>Protected content</div>
            </AppLayout>
        );

        expect(screen.getAllByTestId('app-header-desktop-nav-skeleton-item')).toHaveLength(4);
        expect(screen.getAllByTestId('app-header-mobile-nav-skeleton-item')).toHaveLength(4);
    });
});
