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
                unavailableLabel="Google sign-in will be available soon"
                soonLabel="Soon"
            />
        );

        const button = screen.getByRole('button', { name: /Continue with Google/i });

        expect(button).toBeDisabled();
        expect(screen.getByText('Soon')).toBeInTheDocument();
        expect(button).toHaveAccessibleName(
            'Continue with Google. Google sign-in will be available soon. Soon'
        );
    });
});
