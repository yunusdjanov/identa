import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
