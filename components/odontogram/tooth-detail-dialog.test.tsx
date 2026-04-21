import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import type { ApiTreatment } from '@/lib/api/types';
import { ToothDetailDialog } from '@/components/odontogram/tooth-detail-dialog';
import { I18nProvider } from '@/components/providers/i18n-provider';

function normalizeText(value: string | null | undefined) {
    return (value ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

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
        image_count: 0,
        primary_image: null,
        images: [],
        created_at: '2026-03-29T10:00:00Z',
        updated_at: '2026-03-29T10:00:00Z',
        ...overrides,
    };
}

function renderDialog(treatments: ApiTreatment[]) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });

    render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en">
                <ToothDetailDialog
                    open={true}
                    onOpenChange={() => {}}
                    patientId="patient-1"
                    toothNumber={14}
                    treatments={treatments}
                />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('ToothDetailDialog (history-first mode)', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders treatment-based summary and rows', () => {
        renderDialog([
            buildTreatment({ id: 't-1', debt_amount: 1200000, paid_amount: 600000, balance: 600000 }),
            buildTreatment({ id: 't-2', debt_amount: 30000, paid_amount: 10000, balance: 20000, treatment_type: 'Filling' }),
        ]);

        expect(screen.getByText('Tooth #14')).toBeInTheDocument();
        expect(screen.getByText((_, element) => normalizeText(element?.textContent) === '1 230 000 UZS')).toBeInTheDocument();
        expect(screen.getByText((_, element) => normalizeText(element?.textContent) === '610 000 UZS')).toBeInTheDocument();
        expect(screen.getByText((_, element) => normalizeText(element?.textContent) === '620 000 UZS')).toBeInTheDocument();
        expect(screen.getByText((_, element) => normalizeText(element?.textContent) === '1 200 000 UZS')).toBeInTheDocument();
        expect(screen.getByText('Root canal treatment')).toBeInTheDocument();
        expect(screen.getByText('Filling')).toBeInTheDocument();
    });

    it('shows empty state without footer action buttons', () => {
        renderDialog([]);

        expect(screen.getByText('No history entries yet.')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'History' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Add Entry' })).not.toBeInTheDocument();
    });

    it('opens image preview from treatment row', async () => {
        const user = userEvent.setup();

        renderDialog([
            buildTreatment({
                id: 't-3',
                image_count: 2,
                primary_image: {
                    id: 'img-1',
                    mime_type: 'image/jpeg',
                    file_size: 1234,
                    created_at: '2026-03-29T10:00:00Z',
                    url: 'https://example.com/before.jpg',
                },
                images: [
                    {
                        id: 'img-1',
                        mime_type: 'image/jpeg',
                        file_size: 1234,
                        created_at: '2026-03-29T10:00:00Z',
                        url: 'https://example.com/before.jpg',
                    },
                    {
                        id: 'img-2',
                        mime_type: 'image/jpeg',
                        file_size: 2234,
                        created_at: '2026-03-29T10:05:00Z',
                        url: 'https://example.com/after.jpg',
                    },
                ],
            }),
        ]);

        await user.click(screen.getByRole('button', { name: 'Images (2)' }));
        expect(screen.getByRole('heading', { name: /Image 1 -/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /next image/i }));
        expect(screen.getByRole('heading', { name: /Image 2 -/i })).toBeInTheDocument();
    });
});
