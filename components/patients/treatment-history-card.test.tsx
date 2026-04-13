import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { TreatmentHistoryCard } from '@/components/patients/treatment-history-card';
import {
    createPatientTreatment,
    deletePatientTreatment,
    deletePatientTreatmentImage,
    listAllPatientTreatments,
    updatePatientTreatment,
    uploadPatientTreatmentImage,
} from '@/lib/api/dentist';

vi.mock('@/lib/api/dentist', () => ({
    createPatientTreatment: vi.fn(),
    deletePatientTreatment: vi.fn(),
    deletePatientTreatmentImage: vi.fn(),
    listAllPatientTreatments: vi.fn(),
    updatePatientTreatment: vi.fn(),
    uploadPatientTreatmentImage: vi.fn(),
}));

function renderCard() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale="en">
                <TreatmentHistoryCard patientId="patient-1" patientName="Sardor" />
            </I18nProvider>
        </QueryClientProvider>
    );
}

describe('TreatmentHistoryCard image controls', () => {
    beforeEach(() => {
        vi.mocked(createPatientTreatment).mockReset();
        vi.mocked(deletePatientTreatment).mockReset();
        vi.mocked(deletePatientTreatmentImage).mockReset();
        vi.mocked(listAllPatientTreatments).mockReset();
        vi.mocked(updatePatientTreatment).mockReset();
        vi.mocked(uploadPatientTreatmentImage).mockReset();

        vi.mocked(listAllPatientTreatments).mockResolvedValue([
            {
                id: 'treatment-1',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: 9,
                teeth: [9],
                treatment_type: 'Davalash',
                description: null,
                comment: null,
                treatment_date: '2026-04-05',
                cost: null,
                debt_amount: 120000,
                paid_amount: 60000,
                balance: 60000,
                notes: null,
                images: [
                    {
                        id: 'image-1',
                        mime_type: 'image/jpeg',
                        file_size: 1024,
                        created_at: '2026-04-05T10:00:00Z',
                        url: 'https://example.com/tooth-1.jpg',
                        thumbnail_url: 'https://example.com/tooth-1-thumb.jpg',
                        preview_url: 'https://example.com/tooth-1-preview.jpg',
                    },
                    {
                        id: 'image-2',
                        mime_type: 'image/jpeg',
                        file_size: 1024,
                        created_at: '2026-04-05T10:01:00Z',
                        url: 'https://example.com/tooth-2.jpg',
                        thumbnail_url: 'https://example.com/tooth-2-thumb.jpg',
                        preview_url: 'https://example.com/tooth-2-preview.jpg',
                    },
                ],
                created_at: '2026-04-05T10:00:00Z',
                updated_at: '2026-04-05T10:00:00Z',
            },
        ] as never);
    });

    afterEach(() => {
        cleanup();
    });

    it('uses compact thumbnails with icon remove and restore controls in edit mode', async () => {
        const user = userEvent.setup();

        renderCard();

        await waitFor(() => {
            expect(screen.getByText('Davalash')).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: 'Edit Entry' }));

        expect(screen.getByRole('button', { name: 'Image 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 2' })).toBeInTheDocument();
        expect(screen.queryByText('tooth-1.jpg')).not.toBeInTheDocument();
        expect(screen.getByAltText('Image 1')).toHaveAttribute('src', 'https://example.com/tooth-1-thumb.jpg');

        await user.click(screen.getByRole('button', { name: 'Image 2' }));
        expect(screen.getByRole('heading', { name: 'Image 2 - Apr 5, 2026' })).toBeInTheDocument();
        expect(document.querySelector('img[src="https://example.com/tooth-2-preview.jpg"]')).toBeInTheDocument();
        expect(screen.getByText('2 / 2')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Close' }));

        const removeButtons = screen.getAllByRole('button', { name: 'Remove image' });
        expect(removeButtons).toHaveLength(2);

        await user.click(removeButtons[0]);
        expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    });
});
