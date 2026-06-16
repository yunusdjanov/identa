import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClinicalSnapshotCard } from '@/components/patients/clinical-snapshot-card';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { getCurrentUser } from '@/lib/api/dentist';
import type { ApiTreatment } from '@/lib/api/types';

vi.mock('@/lib/api/dentist', () => ({
    getCurrentUser: vi.fn(),
}));

const SNAPSHOT_ODONTOGRAM_OPEN_KEY = 'identa:patient-history-snapshot-odontogram-open';

function renderCard(treatments: ApiTreatment[] = []) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
                <ClinicalSnapshotCard patientId="patient-1" treatments={treatments} />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('ClinicalSnapshotCard', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getCurrentUser).mockResolvedValue({
            id: 'user-1',
            name: 'Dr. Test',
            email: 'dr@example.test',
            role: 'dentist',
            account_status: 'active',
        } as never);
    });

    afterEach(() => {
        cleanup();
        window.localStorage.clear();
    });

    it('opens the odontogram from the stored preference without a sync effect update', () => {
        window.localStorage.setItem(SNAPSHOT_ODONTOGRAM_OPEN_KEY, '1');

        renderCard();

        expect(screen.getByRole('button', { name: /hide snapshot/i })).toBeInTheDocument();
        expect(screen.getByText('Upper Jaw')).toBeInTheDocument();
    });

    it('persists the collapsed odontogram preference after toggling', () => {
        window.localStorage.setItem(SNAPSHOT_ODONTOGRAM_OPEN_KEY, '1');

        renderCard();
        fireEvent.click(screen.getByRole('button', { name: /hide snapshot/i }));

        expect(window.localStorage.getItem(SNAPSHOT_ODONTOGRAM_OPEN_KEY)).toBe('0');
        expect(screen.getByRole('button', { name: /show snapshot/i })).toBeInTheDocument();
    });
});
