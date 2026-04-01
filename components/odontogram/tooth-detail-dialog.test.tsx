import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToothDetailDialog } from '@/components/odontogram/tooth-detail-dialog';
import { createPatientOdontogramEntry, createPatientTreatment } from '@/lib/api/dentist';
import { toast } from 'sonner';
import { I18nProvider } from '@/components/providers/i18n-provider';

vi.mock('@/lib/api/dentist', () => ({
    createPatientOdontogramEntry: vi.fn(),
    createPatientTreatment: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

function renderDialog(onCreated?: () => void, entries: ComponentProps<typeof ToothDetailDialog>['entries'] = []) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en">
                <ToothDetailDialog
                    open={true}
                    onOpenChange={vi.fn()}
                    patientId="patient-1"
                    toothNumber={14}
                    entries={entries}
                    onCreated={onCreated}
                />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('ToothDetailDialog billing flow', () => {
    beforeEach(() => {
        vi.mocked(createPatientOdontogramEntry).mockReset();
        vi.mocked(createPatientTreatment).mockReset();
    });

    afterEach(() => {
        cleanup();
    });

    it('blocks submission when billing is enabled but amount is invalid', async () => {
        const user = userEvent.setup();

        renderDialog();

        await user.click(screen.getByRole('button', { name: /Add New Condition/i }));
        await user.click(screen.getByRole('checkbox', { name: /Add history entry/i }));
        await user.click(screen.getByRole('button', { name: /Add Condition/i }));

        expect(toast.error).toHaveBeenCalledWith('Debt amount must be greater than 0.');
        expect(createPatientOdontogramEntry).not.toHaveBeenCalled();
        expect(createPatientTreatment).not.toHaveBeenCalled();
    });

    it('blocks submission when paid-now amount exceeds invoice amount', async () => {
        const user = userEvent.setup();

        renderDialog();

        await user.click(screen.getByRole('button', { name: /Add New Condition/i }));
        await user.click(screen.getByRole('checkbox', { name: /Add history entry/i }));
        await user.type(screen.getByLabelText(/^Debt$/i), '50000');
        await user.type(screen.getByLabelText(/^Paid$/i), '60000');
        await user.click(screen.getByRole('button', { name: /Add Condition/i }));

        expect(toast.error).toHaveBeenCalledWith('Paid amount cannot exceed the invoice amount.');
        expect(createPatientOdontogramEntry).not.toHaveBeenCalled();
        expect(createPatientTreatment).not.toHaveBeenCalled();
    });

    it('creates a history entry when billing is enabled', async () => {
        const user = userEvent.setup();
        vi.mocked(createPatientOdontogramEntry).mockResolvedValue({
            id: 'entry-1',
            patient_id: 'patient-1',
            tooth_number: 14,
            condition_type: 'cavity',
            surface: null,
            material: null,
            severity: null,
            condition_date: '2026-02-16',
            notes: null,
            created_at: null,
        });
        vi.mocked(createPatientTreatment).mockResolvedValue({
            id: 'treatment-1',
            patient_id: 'patient-1',
            treatment_date: '2026-02-16',
            treatment_type: 'Cavity treatment tooth 14',
            description: null,
            comment: null,
            tooth_number: 14,
            teeth: [14],
            cost: null,
            debt_amount: 120000,
            paid_amount: 40000,
            balance: 80000,
            notes: null,
        } as never);

        renderDialog();

        await user.click(screen.getByRole('button', { name: /Add New Condition/i }));
        await user.click(screen.getByRole('checkbox', { name: /Add history entry/i }));
        await user.type(screen.getByLabelText(/^Debt$/i), '120000');
        await user.type(screen.getByLabelText(/^Paid$/i), '40000');
        await user.type(screen.getByLabelText(/^Entry$/i), 'Cavity treatment tooth 14');
        await user.click(screen.getByRole('button', { name: /Add Condition/i }));

        await waitFor(() => {
            expect(createPatientOdontogramEntry).toHaveBeenCalledWith(
                'patient-1',
                expect.objectContaining({
                    tooth_number: 14,
                    condition_type: 'cavity',
                })
            );
        });

        await waitFor(() => {
            expect(createPatientTreatment).toHaveBeenCalledWith(
                'patient-1',
                expect.objectContaining({
                    tooth_number: 14,
                    debt_amount: 120000,
                    paid_amount: 40000,
                    treatment_type: 'Cavity treatment tooth 14',
                })
            );
        });

        expect(toast.success).toHaveBeenCalledWith('Condition and history entry saved.');
    });

    it('saves condition without history entry when billing toggle is disabled', async () => {
        const user = userEvent.setup();
        vi.mocked(createPatientOdontogramEntry).mockResolvedValue({
            id: 'entry-1',
            patient_id: 'patient-1',
            tooth_number: 14,
            condition_type: 'cavity',
            surface: null,
            material: null,
            severity: null,
            condition_date: '2026-02-16',
            notes: null,
            created_at: null,
        });

        renderDialog();

        await user.click(screen.getByRole('button', { name: /Add New Condition/i }));
        await user.click(screen.getByRole('button', { name: /Add Condition/i }));

        await waitFor(() => {
            expect(createPatientOdontogramEntry).toHaveBeenCalled();
        });
        expect(createPatientTreatment).not.toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith('Tooth condition saved.');
    });

    it('keeps condition saved when history creation fails', async () => {
        const onCreated = vi.fn();
        const user = userEvent.setup();

        vi.mocked(createPatientOdontogramEntry).mockResolvedValue({
            id: 'entry-1',
            patient_id: 'patient-1',
            tooth_number: 14,
            condition_type: 'cavity',
            surface: null,
            material: null,
            severity: null,
            condition_date: '2026-02-16',
            notes: null,
            created_at: null,
        });
        vi.mocked(createPatientTreatment).mockRejectedValue(new Error('History API failed'));

        renderDialog(onCreated);

        await user.click(screen.getByRole('button', { name: /Add New Condition/i }));
        await user.click(screen.getByRole('checkbox', { name: /Add history entry/i }));
        await user.type(screen.getByLabelText(/^Debt$/i), '90000');
        await user.type(screen.getByLabelText(/^Paid$/i), '0');
        await user.click(screen.getByRole('button', { name: /Add Condition/i }));

        await waitFor(() => {
            expect(onCreated).toHaveBeenCalled();
        });

        expect(toast.success).toHaveBeenCalledWith('Tooth condition saved.');
        expect(toast.error).toHaveBeenCalledWith(
            expect.stringContaining('Condition saved, but history entry failed:')
        );
    });

    it('exits edit mode when collapse or edit is clicked while editing history item', async () => {
        const user = userEvent.setup();

        renderDialog(undefined, [
            {
                id: 'entry-10',
                patient_id: 'patient-1',
                tooth_number: 14,
                condition_type: 'crown',
                surface: null,
                material: 'gold',
                severity: null,
                condition_date: '2026-03-10',
                notes: null,
                created_at: '2026-03-10T09:00:00Z',
                images: [],
            },
        ]);

        await user.click(screen.getByRole('button', { name: /^Edit$/i }));
        expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Collapse/i }));
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /Save Changes/i })).not.toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: /^Edit$/i }));
        expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /^Edit$/i }));
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /Save Changes/i })).not.toBeInTheDocument();
        });
    });

    it('keeps add condition and history edit/details mutually exclusive', async () => {
        const user = userEvent.setup();

        renderDialog(undefined, [
            {
                id: 'entry-20',
                patient_id: 'patient-1',
                tooth_number: 14,
                condition_type: 'crown',
                surface: null,
                material: 'gold',
                severity: null,
                condition_date: '2026-03-10',
                notes: null,
                created_at: '2026-03-10T09:00:00Z',
                images: [],
            },
        ]);

        await user.click(screen.getByRole('button', { name: /Add New Condition/i }));
        expect(screen.getByRole('button', { name: /Add Condition/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /^Edit$/i }));
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /Add Condition/i })).not.toBeInTheDocument();
        });
        expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Add New Condition/i }));
        expect(screen.getByRole('button', { name: /Add Condition/i })).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /Save Changes/i })).not.toBeInTheDocument();
        });
    });
});
