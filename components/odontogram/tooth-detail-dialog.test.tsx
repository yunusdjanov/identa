import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ApiTreatment } from '@/lib/api/types';
import { ToothDetailDialog } from '@/components/odontogram/tooth-detail-dialog';
import { I18nProvider } from '@/components/providers/i18n-provider';

function buildTreatment(overrides: Partial<ApiTreatment>): ApiTreatment {
    return {
        id: 'treatment-1',
        patient_id: 'patient-1',
        patient_name: 'Sardor',
        patient_phone: '+998 90 123 45 67',
        patient_secondary_phone: null,
        patient_code: 'PT-1234AA',
        tooth_number: 14,
        teeth: [14],
        treatment_type: 'Root canal treatment',
        description: null,
        comment: null,
        treatment_date: '2026-03-29',
        cost: null,
        debt_amount: 120000,
        paid_amount: 40000,
        balance: 80000,
        notes: null,
        before_image_url: null,
        after_image_url: null,
        created_at: '2026-03-29T10:00:00Z',
        updated_at: '2026-03-29T10:00:00Z',
        ...overrides,
    };
}

function renderDialog(treatments: ApiTreatment[]) {
    render(
        <I18nProvider initialLocale="en">
            <ToothDetailDialog
                open={true}
                onOpenChange={() => {}}
                toothNumber={14}
                treatments={treatments}
            />
        </I18nProvider>
    );
}

describe('ToothDetailDialog (history-first mode)', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders treatment-based summary and rows', () => {
        renderDialog([
            buildTreatment({ id: 't-1', debt_amount: 120000, paid_amount: 40000, balance: 80000 }),
            buildTreatment({ id: 't-2', debt_amount: 30000, paid_amount: 10000, balance: 20000, treatment_type: 'Filling' }),
        ]);

        expect(screen.getByText('Tooth #14')).toBeInTheDocument();
        expect(screen.getByText('150,000 UZS')).toBeInTheDocument();
        expect(screen.getByText('50,000 UZS')).toBeInTheDocument();
        expect(screen.getByText('100,000 UZS')).toBeInTheDocument();
        expect(screen.getByText('Root canal treatment')).toBeInTheDocument();
        expect(screen.getByText('Filling')).toBeInTheDocument();
    });

    it('shows empty state without footer action buttons', () => {
        renderDialog([]);

        expect(screen.getByText('No history entries yet.')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'History' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Add Entry' })).not.toBeInTheDocument();
    });

    it('opens before/after image preview from treatment row', async () => {
        const user = userEvent.setup();

        renderDialog([
            buildTreatment({
                id: 't-3',
                before_image_url: 'https://example.com/before.jpg',
                after_image_url: 'https://example.com/after.jpg',
            }),
        ]);

        await user.click(screen.getByRole('button', { name: 'Before' }));
        expect(screen.getByRole('img', { name: /Before Image/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'After' }));
        expect(screen.getByRole('img', { name: /After Image/i })).toBeInTheDocument();
    });
});
