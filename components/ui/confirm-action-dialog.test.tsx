import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';

describe('ConfirmActionDialog responsiveness', () => {
    afterEach(() => {
        cleanup();
    });

    it('keeps long content scrollable while actions remain visible', () => {
        render(
            <ConfirmActionDialog
                open
                onOpenChange={vi.fn()}
                title="Delete patient"
                description="This description can become long after localization."
                requireConfirmationText="DELETE"
                confirmationLabel="Type DELETE"
                onConfirm={vi.fn()}
            />
        );

        const dialog = screen.getByRole('dialog');
        expect(dialog).toHaveClass(
            'flex',
            'max-h-[calc(100dvh-1.5rem)]',
            'flex-col',
            'overflow-hidden'
        );
        expect(screen.getByLabelText('Type DELETE').parentElement?.parentElement)
            .toHaveClass('overflow-y-auto');
        expect(screen.getByRole('button', { name: 'Confirm' }).parentElement)
            .toHaveClass('shrink-0');
    });
});
