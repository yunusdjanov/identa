import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { GoogleAuthButton } from '@/components/auth/google-auth-button';

describe('GoogleAuthButton', () => {
    it('shows a disabled coming-soon Google button when Google auth is not configured', () => {
        render(
            <GoogleAuthButton
                mountRef={{ current: null }}
                isConfigured={false}
                isReady={false}
                isPending={false}
                label="Continue with Google"
                unavailableLabel="Google sign-in is unavailable on this preview"
            />
        );

        const button = screen.getByRole('button', { name: /Continue with Google/i });

        expect(button).toBeDisabled();
        // The "Soon" pill was retired when Google went live; the disabled
        // fallback now communicates "why" via tooltip + accessible name.
        expect(screen.queryByText(/soon/i)).not.toBeInTheDocument();
        expect(button).toHaveAccessibleName(
            'Continue with Google. Google sign-in is unavailable on this preview'
        );
    });

    it('renders an app-owned button before the Google script is requested', async () => {
        const user = userEvent.setup();
        const onLoadRequest = vi.fn();
        render(
            <GoogleAuthButton
                mountRef={{ current: null }}
                isConfigured
                isReady={false}
                isPending={false}
                label="Continue with Google"
                unavailableLabel="Google sign-in is unavailable on this preview"
                isLoadRequested={false}
                onLoadRequest={onLoadRequest}
            />
        );

        await user.click(screen.getByRole('button', { name: 'Continue with Google' }));

        expect(onLoadRequest).toHaveBeenCalledTimes(1);
    });
});
