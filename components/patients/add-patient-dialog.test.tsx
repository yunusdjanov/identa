import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddPatientDialog } from '@/components/patients/add-patient-dialog';
import { createPatient, listPatientCategories, uploadPatientPhoto } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';

vi.mock('@/components/ui/select', async () => {
    const React = await import('react');
    type SelectContextValue = {
        value?: string;
        onValueChange?: (value: string) => void;
    };
    const SelectContext = React.createContext<SelectContextValue>({});

    function Select({
        value,
        onValueChange,
        children,
    }: {
        value?: string;
        onValueChange?: (value: string) => void;
        children: React.ReactNode;
    }) {
        return (
            <SelectContext.Provider value={{ value, onValueChange }}>
                {children}
            </SelectContext.Provider>
        );
    }

    function SelectTrigger({
        id,
        className,
        children,
    }: {
        id?: string;
        className?: string;
        children: React.ReactNode;
    }) {
        return (
            <div id={id} className={className}>
                {children}
            </div>
        );
    }

    function SelectValue({ placeholder }: { placeholder?: string }) {
        const context = React.useContext(SelectContext);
        return <span>{context.value || placeholder || ''}</span>;
    }

    function SelectContent({ children }: { children: React.ReactNode }) {
        return <div>{children}</div>;
    }

    function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
        const context = React.useContext(SelectContext);
        return (
            <button type="button" onClick={() => context.onValueChange?.(value)}>
                {children}
            </button>
        );
    }

    return {
        Select,
        SelectTrigger,
        SelectValue,
        SelectContent,
        SelectItem,
    };
});

vi.mock('@/lib/api/dentist', () => ({
    createPatient: vi.fn(),
    listPatientCategories: vi.fn(),
    uploadPatientPhoto: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('AddPatientDialog', () => {
    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        vi.mocked(createPatient).mockReset();
        vi.mocked(listPatientCategories).mockReset();
        vi.mocked(uploadPatientPhoto).mockReset();
        vi.mocked(listPatientCategories).mockResolvedValue([]);
    });

    it('submits required patient payload and closes dialog on success', async () => {
        vi.mocked(createPatient).mockResolvedValue({
            id: 'patient-1',
            patient_id: 'PT-20260214-0001',
            full_name: 'John Doe',
            phone: '+998901234567',
            address: null,
            date_of_birth: null,
            gender: null,
            medical_history: null,
            allergies: null,
            current_medications: null,
        });

        const onOpenChange = vi.fn();
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const user = userEvent.setup();

        render(
            <I18nProvider initialLocale="en">
                <QueryClientProvider client={queryClient}>
                    <AddPatientDialog open={true} onOpenChange={onOpenChange} />
                </QueryClientProvider>
            </I18nProvider>
        );

        await user.type(screen.getByLabelText(/Full Name/i), 'John Doe');
        await user.type(screen.getByLabelText(/^Phone Number\b/i), '+998901234567');
        await user.type(screen.getByLabelText(/Address/i), '1 Main St');
        await user.type(screen.getByLabelText(/Medical History/i), 'Hypertension');

        await user.click(screen.getByRole('button', { name: /Add Patient/i }));

        await waitFor(() => {
            expect(createPatient).toHaveBeenCalledWith({
                full_name: 'John Doe',
                phone: '+998901234567',
                secondary_phone: undefined,
                address: '1 Main St',
                date_of_birth: undefined,
                medical_history: 'Hypertension',
                allergies: undefined,
                current_medications: undefined,
            });
        });

        await waitFor(() => {
            expect(onOpenChange).toHaveBeenCalledWith(false);
        });
    });

    it('submits selected category and secondary phone', async () => {
        vi.mocked(listPatientCategories).mockResolvedValue([
            {
                id: 'cat-vip',
                name: 'VIP',
                color: '#3B82F6',
                sort_order: 1,
            },
        ]);
        vi.mocked(createPatient).mockResolvedValue({
            id: 'patient-2',
            patient_id: 'PT-20260214-0002',
            full_name: 'Jane Doe',
            phone: '+998901112233',
            secondary_phone: '+998909998877',
            address: null,
            date_of_birth: null,
            gender: 'female',
            medical_history: null,
            allergies: null,
            current_medications: null,
        });

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false },
                mutations: { retry: false },
            },
        });
        const user = userEvent.setup();

        render(
            <I18nProvider initialLocale="en">
                <QueryClientProvider client={queryClient}>
                    <AddPatientDialog open={true} onOpenChange={vi.fn()} />
                </QueryClientProvider>
            </I18nProvider>
        );

        await user.type(screen.getByLabelText(/Full Name/i), 'Jane Doe');
        await user.type(screen.getByLabelText(/^Phone Number\b/i), '+998901112233');
        await user.type(screen.getByLabelText(/Second Phone Number/i), '+998909998877');
        await user.click(screen.getByRole('button', { name: 'VIP' }));
        await user.click(screen.getByRole('button', { name: /Add Patient/i }));

        await waitFor(() => {
            expect(createPatient).toHaveBeenCalledWith({
                full_name: 'Jane Doe',
                phone: '+998901112233',
                secondary_phone: '+998909998877',
                category_id: 'cat-vip',
                address: undefined,
                date_of_birth: undefined,
                medical_history: undefined,
                allergies: undefined,
                current_medications: undefined,
            });
        });
    });
});
