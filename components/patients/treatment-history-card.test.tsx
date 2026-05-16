import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { TreatmentHistoryCard } from '@/components/patients/treatment-history-card';
import {
    createPatientTreatment,
    deletePatientTreatment,
    deletePatientTreatmentImage,
    getCurrentUser,
    listAllPatientTreatments,
    updatePatientTreatment,
    uploadPatientTreatmentImage,
    uploadPatientTreatmentImages,
} from '@/lib/api/dentist';

vi.mock('@/lib/api/dentist', () => ({
    createPatientTreatment: vi.fn(),
    deletePatientTreatment: vi.fn(),
    deletePatientTreatmentImage: vi.fn(),
    getCurrentUser: vi.fn(),
    listAllPatientTreatments: vi.fn(),
    updatePatientTreatment: vi.fn(),
    uploadPatientTreatmentImage: vi.fn(),
    uploadPatientTreatmentImages: vi.fn(),
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
            <I18nProvider initialLocale="en" initialDictionary={DICTIONARIES.en}>
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
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(listAllPatientTreatments).mockReset();
        vi.mocked(updatePatientTreatment).mockReset();
        vi.mocked(uploadPatientTreatmentImage).mockReset();
        vi.mocked(uploadPatientTreatmentImages).mockReset();

        vi.mocked(getCurrentUser).mockResolvedValue({
            id: 'dentist-1',
            name: 'Dentist',
            email: 'dentist@example.com',
            role: 'dentist',
            account_status: 'active',
            subscription: {
                is_configured: true,
                plan: 'pro',
                plan_name: 'Pro',
                billing_period: 'monthly',
                status: 'active',
                access_mode: 'full',
                starts_at: '2026-04-01T00:00:00Z',
                ends_at: '2026-05-01T00:00:00Z',
                trial_ends_at: null,
                grace_ends_at: null,
                cancel_at_period_end: false,
                cancelled_at: null,
                days_remaining: 20,
                staff_limit: 5,
                active_staff_count: 0,
                entry_image_limit: 10,
                upload_max_mb: 5,
                stored_image_max_mb: 1,
                can_export: true,
                is_read_only: false,
                payment_method: null,
                payment_amount: null,
                note: null,
            },
        });

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

    it('keeps pending scanned images in processing state without loading full media', async () => {
        const user = userEvent.setup();

        vi.mocked(listAllPatientTreatments).mockResolvedValue([
            {
                id: 'treatment-pending',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: 9,
                teeth: [9],
                treatment_type: 'Pending scan',
                description: null,
                comment: null,
                treatment_date: '2026-04-05',
                cost: null,
                debt_amount: 120000,
                paid_amount: 60000,
                balance: 60000,
                notes: null,
                image_count: 1,
                primary_image: {
                    id: 'image-pending',
                    mime_type: 'image/jpeg',
                    file_size: 1024,
                    created_at: '2026-04-05T10:00:00Z',
                    url: null,
                    thumbnail_url: null,
                    preview_url: null,
                    scan_status: 'pending',
                },
                images: [
                    {
                        id: 'image-pending',
                        mime_type: 'image/jpeg',
                        file_size: 1024,
                        created_at: '2026-04-05T10:00:00Z',
                        url: null,
                        thumbnail_url: null,
                        preview_url: null,
                        scan_status: 'pending',
                    },
                ],
                created_at: '2026-04-05T10:00:00Z',
                updated_at: '2026-04-05T10:00:00Z',
            },
        ] as never);

        renderCard();

        await waitFor(() => {
            expect(screen.getByText('Pending scan')).toBeInTheDocument();
        });

        expect(screen.getByTitle('Images processing')).toBeInTheDocument();
        expect(document.querySelector('img[src]')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Edit Entry' }));

        const pendingPreviewButton = screen.getByRole('button', { name: 'Image 1' });
        expect(pendingPreviewButton).toBeDisabled();
        expect(screen.getByTitle('Image is processing')).toBeInTheDocument();
        expect(document.querySelector('img[src]')).not.toBeInTheDocument();
    });
});
