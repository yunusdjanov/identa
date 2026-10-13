import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PageHeader } from '@/components/ui/page-shell';

describe('PageHeader', () => {
    afterEach(() => {
        cleanup();
    });

    it('keeps the default page-header density unchanged', () => {
        render(
            <PageHeader
                title="Patients"
                description="Manage patient records"
                actions={<button type="button">Add patient</button>}
            />
        );

        const heading = screen.getByRole('heading', { name: 'Patients' });
        expect(heading.closest('section')).toHaveClass('px-4', 'py-3');
        expect(heading).toHaveClass('text-xl');
        expect(screen.getByText('Manage patient records')).not.toHaveClass('hidden');
        expect(screen.getByRole('button', { name: 'Add patient' }).parentElement).toHaveClass('gap-2');
    });

    it('uses the compact mobile density without changing the desktop breakpoint', () => {
        render(
            <PageHeader
                title="Dashboard"
                description="Daily schedule"
                actions={<button type="button">Add appointment</button>}
                mobileDensity="compact"
            />
        );

        const heading = screen.getByRole('heading', { name: 'Dashboard' });
        expect(heading.closest('section')).toHaveClass('px-3', 'py-2', 'sm:px-5', 'sm:py-4');
        expect(heading).toHaveClass('text-lg', 'sm:text-2xl');
        expect(screen.getByText('Daily schedule')).toHaveClass('hidden', 'sm:block');
        expect(screen.getByRole('button', { name: 'Add appointment' }).parentElement)
            .toHaveClass('gap-1', 'sm:gap-2');
    });
});
