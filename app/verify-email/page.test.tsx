import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VerifyEmailPage from '@/app/verify-email/page';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

let searchString = '';
vi.mock('next/navigation', () => ({
    useSearchParams: () => new URLSearchParams(searchString),
}));

function renderPage() {
    return render(
        <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
            <VerifyEmailPage />
        </I18nProvider>
    );
}

describe('VerifyEmailPage', () => {
    afterEach(() => cleanup());

    it('shows the success state for status=success', async () => {
        searchString = 'status=success';
        renderPage();
        // verifyEmail.page.successTitle (EN) = "Email verified"
        expect(await screen.findByText('Email verified')).toBeInTheDocument();
    });

    it('shows the invalid state when no status is provided', async () => {
        searchString = '';
        renderPage();
        // verifyEmail.page.invalidTitle (EN) = "Link invalid"
        expect(await screen.findByText('Link invalid')).toBeInTheDocument();
    });
});
