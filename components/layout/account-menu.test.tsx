import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountMenu } from '@/components/layout/account-menu';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

const push = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
}));

describe('AccountMenu', () => {
    beforeEach(() => {
        push.mockReset();
    });

    it('contains long account names instead of expanding the shared header', () => {
        render(
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <AccountMenu
                    user={{
                        id: '1',
                        name: 'A Dentist With An Exceptionally Long Display Name',
                        email: 'dentist@identa.test',
                        role: 'dentist',
                        account_status: 'active',
                    }}
                    onLogout={vi.fn()}
                />
            </I18nProvider>
        );

        const trigger = screen.getByRole('button', { name: /my account/i });
        const name = trigger.querySelector<HTMLElement>('[title]');

        expect(trigger).toHaveClass('lg:max-w-[13rem]', 'xl:max-w-[18rem]', '2xl:max-w-[22rem]');
        expect(name).toHaveClass('truncate');
        expect(name?.parentElement).toHaveClass('min-w-0');
    });
});
