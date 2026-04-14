import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManageCategoriesDialog } from '@/components/patients/manage-categories-dialog';
import {
    createPatientCategory,
    deletePatientCategory,
    listPatientCategories,
    updatePatientCategory,
} from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';

vi.mock('@/lib/api/dentist', () => ({
    createPatientCategory: vi.fn(),
    updatePatientCategory: vi.fn(),
    deletePatientCategory: vi.fn(),
    listPatientCategories: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

function renderDialog() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <I18nProvider initialLocale="en">
            <QueryClientProvider client={queryClient}>
                <ManageCategoriesDialog open={true} onOpenChange={vi.fn()} />
            </QueryClientProvider>
        </I18nProvider>
    );
}

describe('ManageCategoriesDialog', () => {
    beforeEach(() => {
        vi.mocked(createPatientCategory).mockReset();
        vi.mocked(updatePatientCategory).mockReset();
        vi.mocked(deletePatientCategory).mockReset();
        vi.mocked(listPatientCategories).mockReset();

        vi.mocked(listPatientCategories).mockResolvedValue([
            {
                id: 'cat-1',
                name: 'Priority',
                color: '#f97316',
                sort_order: 1,
            },
        ]);
        vi.mocked(createPatientCategory).mockResolvedValue({
            id: 'cat-2',
            name: 'VIP',
            color: '#3b82f6',
            sort_order: 2,
        });
        vi.mocked(updatePatientCategory).mockResolvedValue({
            id: 'cat-1',
            name: 'Priority Updated',
            color: '#ef4444',
            sort_order: 1,
        });
        vi.mocked(deletePatientCategory).mockResolvedValue();
    });

    it('handles create, update, and delete flows', async () => {
        const user = userEvent.setup();
        renderDialog();

        await waitFor(() => {
            expect(screen.getByText('Priority')).toBeInTheDocument();
        });

        await user.type(screen.getByLabelText(/Name/i), 'VIP');
        await user.click(screen.getByRole('button', { name: /^Add$/i }));

        await waitFor(() => {
            expect(createPatientCategory).toHaveBeenCalledWith({
                name: 'VIP',
                color: '#3B82F6',
                sort_order: 2,
            });
        });

        await user.click(screen.getByRole('button', { name: /^Edit$/i }));
        const editInput = screen.getByDisplayValue('Priority');
        await user.clear(editInput);
        await user.type(editInput, 'Priority Updated');
        await user.click(screen.getByRole('button', { name: /^Save Changes$/i }));

        await waitFor(() => {
            expect(updatePatientCategory).toHaveBeenCalledWith('cat-1', {
                name: 'Priority Updated',
                color: '#f97316',
                sort_order: 1,
            });
        });

        await user.click(screen.getByRole('button', { name: /^Delete$/i }));
        await user.click(screen.getByRole('button', { name: /Confirm Delete/i }));

        await waitFor(() => {
            expect(deletePatientCategory).toHaveBeenCalledWith('cat-1');
        });
    });
});
