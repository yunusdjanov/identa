import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

function renderState(props: Partial<React.ComponentProps<typeof AccessDeniedState>> = {}) {
    return render(
        <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
            <AccessDeniedState title="No access" description="You cannot view this." {...props} />
        </I18nProvider>
    );
}

describe('AccessDeniedState', () => {
    afterEach(() => cleanup());

    it('renders the provided title and description with the 403 badge', () => {
        renderState();
        expect(screen.getByText('No access')).toBeInTheDocument();
        expect(screen.getByText('You cannot view this.')).toBeInTheDocument();
        expect(screen.getByText('403')).toBeInTheDocument();
    });

    it('falls back to translated eyebrow and action label when not provided', () => {
        renderState();
        // permissions.deniedTitle (EN) = "Access denied"
        expect(screen.getByText('Access denied')).toBeInTheDocument();
        // dashboard.title (EN) = "Dashboard"
        expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    });

    it('uses an explicit action label when provided', () => {
        renderState({ actionLabel: 'Go back', eyebrow: 'Blocked' });
        expect(screen.getByRole('link', { name: 'Go back' })).toBeInTheDocument();
        expect(screen.getByText('Blocked')).toBeInTheDocument();
    });
});
