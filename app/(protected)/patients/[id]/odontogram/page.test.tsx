import { Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OdontogramPage from '@/app/(protected)/patients/[id]/odontogram/page';
import { getCurrentUser, getPatient, listAllPatientTreatments } from '@/lib/api/dentist';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
    getPatient: vi.fn(),
    listAllPatientTreatments: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const dentist = {
    id: '1', name: 'Demo Dentist', email: 'dentist@identa.test',
    role: 'dentist' as const, account_status: 'active' as const,
};
const assistantNoAccess = {
    id: '2', name: 'Assistant', email: 'assistant@identa.test',
    role: 'assistant' as const, account_status: 'active' as const, permissions: [],
};
const patient = { id: 'p-1', full_name: 'John Smith', categories: [], deleted_at: null };

async function renderPage() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    await act(async () => {
        render(
            <QueryClientProvider client={queryClient}>
                <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                    <Suspense fallback={<div>loading</div>}>
                        <OdontogramPage params={Promise.resolve({ id: 'p-1' })} />
                    </Suspense>
                </I18nProvider>
            </QueryClientProvider>
        );
    });
}

describe('OdontogramPage', () => {
    beforeEach(() => {
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getPatient).mockReset();
        vi.mocked(listAllPatientTreatments).mockResolvedValue([] as never);
    });

    afterEach(() => {
        cleanup();
    });

    it('shows an error state when the patient fails to load', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockRejectedValue(new Error('boom'));
        await renderPage();
        expect(await screen.findByText('Could not load data')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('denies access to an assistant without the patients permission', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(assistantNoAccess as never);
        await renderPage();
        expect(await screen.findByText('Ask your account owner for access.')).toBeInTheDocument();
    });

    it('renders the odontogram chart for a dentist', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(dentist as never);
        vi.mocked(getPatient).mockResolvedValue(patient as never);
        await renderPage();
        // odontogram.title (EN) = "Odontogram"
        expect(await screen.findByText('Odontogram')).toBeInTheDocument();
        expect(screen.getByTitle('Tooth #18')).toBeInTheDocument();
        expect(screen.getByTitle('Tooth #21')).toBeInTheDocument();
        expect(screen.getByTitle('Tooth #48')).toBeInTheDocument();
        expect(screen.getByTestId('odontogram-upper-jaw-scroll')).toHaveClass('overflow-x-auto');
        expect(screen.getByTestId('odontogram-lower-jaw-scroll')).toHaveClass('overflow-x-auto');
    });
});
