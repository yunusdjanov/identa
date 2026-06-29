import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditPatientDialog } from '@/components/patients/edit-patient-dialog';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { deletePatientPhoto, listPatientCategories, updatePatient, uploadPatientPhoto } from '@/lib/api/dentist';
import type { ApiPatient } from '@/lib/api/types';

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
    deletePatientPhoto: vi.fn(),
    listPatientCategories: vi.fn(),
    updatePatient: vi.fn(),
    uploadPatientPhoto: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

const patient: ApiPatient = {
    id: 'patient-1',
    patient_id: 'PT-TEST1',
    full_name: 'John Doe',
    phone: '+998901234567',
    secondary_phone: '+998909998877',
    address: '1 Main St',
    date_of_birth: '1990-01-01',
    gender: null,
    medical_history: 'Hypertension',
    allergies: 'Penicillin',
    current_medications: 'Aspirin',
    categories: [],
    photo_url: null,
    photo_thumbnail_url: null,
    photo_preview_url: null,
    photo_thumbnail_ready: false,
    photo_preview_ready: false,
    photo_scan_status: null,
};

function renderDialog() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
            <QueryClientProvider client={queryClient}>
                <EditPatientDialog open={true} onOpenChange={vi.fn()} patient={patient} />
            </QueryClientProvider>
        </I18nProvider>
    );
}

describe('EditPatientDialog', () => {
    afterEach(() => {
        cleanup();
    });

    beforeEach(() => {
        vi.mocked(deletePatientPhoto).mockReset();
        vi.mocked(listPatientCategories).mockReset();
        vi.mocked(updatePatient).mockReset();
        vi.mocked(uploadPatientPhoto).mockReset();
        vi.mocked(listPatientCategories).mockResolvedValue([]);
    });

    it('clears optional patient fields by sending null values', async () => {
        vi.mocked(updatePatient).mockResolvedValue({
            ...patient,
            secondary_phone: null,
            address: null,
            date_of_birth: null,
            medical_history: null,
            allergies: null,
            current_medications: null,
        });
        const user = userEvent.setup();

        renderDialog();

        await user.clear(screen.getByLabelText(/Second Phone Number/i));
        await user.clear(screen.getByLabelText(/Address/i));
        await user.clear(screen.getByLabelText(/Date of Birth/i));
        await user.clear(screen.getByLabelText(/Medical History/i));
        await user.clear(screen.getByLabelText(/Allergies & blood pressure/i));
        await user.clear(screen.getByLabelText(/Current Medications/i));
        await user.click(screen.getByRole('button', { name: /Save changes/i }));

        await waitFor(() => {
            expect(updatePatient).toHaveBeenCalledWith('patient-1', {
                full_name: 'John Doe',
                phone: '+998901234567',
                secondary_phone: null,
                category_id: null,
                address: null,
                date_of_birth: null,
                medical_history: null,
                allergies: null,
                current_medications: null,
            });
        });
    });
});
