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
    getPatientTreatment,
    listAllPatientTreatments,
    listPatientTreatments,
    updatePatientTreatment,
    uploadPatientTreatmentImage,
    uploadPatientTreatmentImages,
} from '@/lib/api/dentist';

vi.mock('@/lib/api/dentist', () => ({
    createPatientTreatment: vi.fn(),
    deletePatientTreatment: vi.fn(),
    deletePatientTreatmentImage: vi.fn(),
    getCurrentUser: vi.fn(),
    getPatientTreatment: vi.fn(),
    listAllPatientTreatments: vi.fn(),
    listPatientTreatments: vi.fn(),
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

function treatmentsEnvelope(
    treatments: Array<Record<string, unknown>>,
    options: { page?: number; totalPages?: number; total?: number } = {}
) {
    const page = options.page ?? 1;
    const total = options.total ?? treatments.length;
    const totalPages = options.totalPages ?? 1;
    const totalDebt = treatments.reduce((sum, treatment) => sum + Number(treatment.debt_amount ?? 0), 0);
    const totalPaid = treatments.reduce((sum, treatment) => sum + Number(treatment.paid_amount ?? 0), 0);

    return {
        data: treatments,
        meta: {
            pagination: {
                page,
                per_page: 10,
                total,
                total_pages: totalPages,
            },
            summary: {
                total_count: total,
                total_debt: totalDebt,
                total_paid: totalPaid,
                total_balance: totalDebt - totalPaid,
            },
        },
    } as never;
}

describe('TreatmentHistoryCard image controls', () => {
    beforeEach(() => {
        vi.mocked(createPatientTreatment).mockReset();
        vi.mocked(deletePatientTreatment).mockReset();
        vi.mocked(deletePatientTreatmentImage).mockReset();
        vi.mocked(getCurrentUser).mockReset();
        vi.mocked(getPatientTreatment).mockReset();
        vi.mocked(listAllPatientTreatments).mockReset();
        vi.mocked(listPatientTreatments).mockReset();
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

        vi.mocked(listAllPatientTreatments).mockResolvedValue([] as never);
        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([
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
        ]));
    });

    afterEach(() => {
        cleanup();
    });

    it('renders entries as image-forward timeline cards', async () => {
        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([
            {
                id: 'treatment-timeline',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: 9,
                teeth: [9, 10],
                treatment_type: 'Timeline treatment',
                description: 'Clinical description shown under the title',
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
        ]));

        renderCard();

        expect(await screen.findByRole('heading', { name: 'Timeline treatment' })).toBeInTheDocument();
        expect(screen.getByText('Clinical description shown under the title')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 2' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
        expect(screen.queryByText(/^Teeth:/i)).not.toBeInTheDocument();
        expect(screen.getAllByText('Remaining')).toHaveLength(1);
    });

    it('loads the newest page first and fetches older entries on demand', async () => {
        const user = userEvent.setup();
        const newestTreatment = {
            id: 'treatment-newest',
            patient_id: 'patient-1',
            patient_name: 'Sardor',
            patient_phone: '+998 90 123 45 67',
            patient_secondary_phone: null,
            patient_code: 'PT-1001',
            tooth_number: null,
            teeth: [],
            treatment_type: 'Newest treatment',
            description: null,
            comment: null,
            treatment_date: '2026-04-10',
            cost: null,
            debt_amount: 120000,
            paid_amount: 60000,
            balance: 60000,
            notes: null,
            image_count: 0,
            primary_image: null,
            images: [],
            created_at: '2026-04-10T10:00:00Z',
            updated_at: '2026-04-10T10:00:00Z',
        };
        const olderTreatment = {
            ...newestTreatment,
            id: 'treatment-older',
            treatment_type: 'Older treatment',
            treatment_date: '2026-04-01',
            created_at: '2026-04-01T10:00:00Z',
            updated_at: '2026-04-01T10:00:00Z',
        };

        vi.mocked(listPatientTreatments).mockImplementation(async (_patientId, options) => {
            if (options?.page === 2) {
                return treatmentsEnvelope([olderTreatment], { page: 2, totalPages: 2, total: 2 });
            }

            return treatmentsEnvelope([newestTreatment], { page: 1, totalPages: 2, total: 2 });
        });

        renderCard();

        expect(await screen.findByRole('heading', { name: 'Newest treatment' })).toBeInTheDocument();
        expect(listPatientTreatments).toHaveBeenCalledWith('patient-1', expect.objectContaining({
            page: 1,
            perPage: 10,
            sort: '-treatment_date,-created_at',
            includeImages: true,
            includeSummary: true,
        }));

        await user.click(screen.getByRole('button', { name: 'Load more' }));

        expect(await screen.findByRole('heading', { name: 'Older treatment' })).toBeInTheDocument();
        expect(listPatientTreatments).toHaveBeenCalledWith('patient-1', expect.objectContaining({
            page: 2,
            perPage: 10,
            sort: '-treatment_date,-created_at',
            includeImages: true,
            includeSummary: false,
        }));
    });

    it('does not show a hidden image count when all images fit in the strip', async () => {
        const images = Array.from({ length: 3 }).map((_, index) => ({
            id: `image-fit-${index + 1}`,
            mime_type: 'image/jpeg',
            file_size: 1024,
            created_at: `2026-04-05T10:0${index}:00Z`,
            url: `https://example.com/tooth-fit-${index + 1}.jpg`,
            thumbnail_url: `https://example.com/tooth-fit-${index + 1}-thumb.jpg`,
            preview_url: `https://example.com/tooth-fit-${index + 1}-preview.jpg`,
        }));

        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([
            {
                id: 'treatment-fitting-images',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: null,
                teeth: [],
                treatment_type: 'Fitting images',
                description: null,
                comment: null,
                treatment_date: '2026-04-05',
                cost: null,
                debt_amount: 120000,
                paid_amount: 60000,
                balance: 60000,
                notes: null,
                image_count: images.length,
                primary_image: images[0],
                images,
                created_at: '2026-04-05T10:00:00Z',
                updated_at: '2026-04-05T10:00:00Z',
            },
        ]));

        renderCard();

        expect(await screen.findByRole('heading', { name: 'Fitting images' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 2' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 3' })).toBeInTheDocument();
        expect(screen.queryByText('+1')).not.toBeInTheDocument();
        expect(screen.queryByText('+2')).not.toBeInTheDocument();
    });

    it('limits timeline thumbnails and shows hidden image count with upload affordance', async () => {
        const images = Array.from({ length: 8 }).map((_, index) => ({
            id: `image-${index + 1}`,
            mime_type: 'image/jpeg',
            file_size: 1024,
            created_at: `2026-04-05T10:0${index}:00Z`,
            url: `https://example.com/tooth-${index + 1}.jpg`,
            thumbnail_url: `https://example.com/tooth-${index + 1}-thumb.jpg`,
            preview_url: `https://example.com/tooth-${index + 1}-preview.jpg`,
        }));

        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([
            {
                id: 'treatment-many-images',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: null,
                teeth: [],
                treatment_type: 'Many images',
                description: null,
                comment: null,
                treatment_date: '2026-04-05',
                cost: null,
                debt_amount: 120000,
                paid_amount: 60000,
                balance: 60000,
                notes: null,
                image_count: images.length,
                primary_image: images[0],
                images,
                created_at: '2026-04-05T10:00:00Z',
                updated_at: '2026-04-05T10:00:00Z',
            },
        ]));

        renderCard();

        expect(await screen.findByRole('heading', { name: 'Many images' })).toBeInTheDocument();
        expect(document.querySelector('.snap-x.snap-mandatory')).toBeInTheDocument();
        expect(document.querySelector('.bg-gradient-to-l')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 1' })).toHaveClass('snap-start');
        expect(screen.getByRole('button', { name: 'Image 6' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Image 7' })).not.toBeInTheDocument();
        expect(screen.getByText('+2')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
    });

    it('uses compact thumbnails with icon remove and restore controls in edit mode', async () => {
        const user = userEvent.setup();

        renderCard();

        await waitFor(() => {
            // The component renders `treatment_type` twice — once in the
            // mobile card layout, once in the desktop table layout. In the
            // browser only one is visible (the other has hidden / md:hidden
            // classes), but JSDOM has both. Assert "at least one" to stay
            // resilient to the responsive duplication.
            expect(screen.getAllByText('Davalash').length).toBeGreaterThan(0);
        });

        await user.click(screen.getAllByRole('button', { name: 'Edit Entry' })[0]);

        expect(screen.queryByTitle('Tooth #21')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Tooth #9')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 2' })).toBeInTheDocument();
        expect(screen.queryByText('tooth-1.jpg')).not.toBeInTheDocument();
        expect(screen.getByAltText('Image 1')).toHaveAttribute('src', 'https://example.com/tooth-1-thumb.jpg');

        await user.click(screen.getByRole('button', { name: 'Image 2' }));
        expect(await screen.findByRole('heading', { name: 'Image 2 - Apr 5, 2026' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
        expect(document.querySelector('img[src="https://example.com/tooth-2-preview.jpg"]')).toBeInTheDocument();
        expect(screen.getByText('2 / 2')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Close' }));

        const removeButtons = screen.getAllByRole('button', { name: 'Remove image' });
        expect(removeButtons).toHaveLength(2);

        await user.click(removeButtons[0]);
        expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    });

    it('loads full treatment image detail before opening a partial gallery payload', async () => {
        const user = userEvent.setup();
        const firstImage = {
            id: 'image-1',
            mime_type: 'image/jpeg',
            file_size: 1024,
            created_at: '2026-04-05T10:00:00Z',
            url: 'https://example.com/tooth-1.jpg',
            thumbnail_url: 'https://example.com/tooth-1-thumb.jpg',
            preview_url: 'https://example.com/tooth-1-preview.jpg',
        };
        const fullImages = Array.from({ length: 4 }).map((_, index) => ({
            id: `image-${index + 1}`,
            mime_type: 'image/jpeg',
            file_size: 1024,
            created_at: `2026-04-05T10:0${index}:00Z`,
            url: `https://example.com/tooth-${index + 1}.jpg`,
            thumbnail_url: `https://example.com/tooth-${index + 1}-thumb.jpg`,
            preview_url: `https://example.com/tooth-${index + 1}-preview.jpg`,
        }));
        const partialTreatment = {
            id: 'treatment-partial-gallery',
            patient_id: 'patient-1',
            patient_name: 'Sardor',
            patient_phone: '+998 90 123 45 67',
            patient_secondary_phone: null,
            patient_code: 'PT-1001',
            tooth_number: 9,
            teeth: [9],
            treatment_type: 'Partial gallery',
            description: null,
            comment: null,
            treatment_date: '2026-04-05',
            cost: null,
            debt_amount: 120000,
            paid_amount: 60000,
            balance: 60000,
            notes: null,
            image_count: 4,
            primary_image: firstImage,
            images: [],
            created_at: '2026-04-05T10:00:00Z',
            updated_at: '2026-04-05T10:00:00Z',
        };
        let resolveDetail: (value: unknown) => void = () => {};
        const detailPromise = new Promise((resolve) => {
            resolveDetail = resolve;
        });

        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([partialTreatment]));
        vi.mocked(getPatientTreatment).mockReturnValue(detailPromise as never);

        renderCard();

        await waitFor(() => {
            expect(screen.getAllByText('Partial gallery').length).toBeGreaterThan(0);
        });

        await user.click(screen.getByRole('button', { name: 'Image 1' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(getPatientTreatment).toHaveBeenCalledWith('patient-1', 'treatment-partial-gallery');

        resolveDetail({
            ...partialTreatment,
            images: fullImages,
        });

        await waitFor(() => {
            expect(screen.getByRole('dialog')).toBeInTheDocument();
        });
        expect(screen.getByRole('heading', { name: 'Image 1 - Apr 5, 2026' })).toBeInTheDocument();
        expect(screen.getByText('1 / 4')).toBeInTheDocument();
        expect(document.querySelector('img[src="https://example.com/tooth-4-thumb.jpg"]')).toBeInTheDocument();
    });

    it('keeps pending scanned images in processing state without loading full media', async () => {
        const user = userEvent.setup();

        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([
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
        ]));

        renderCard();

        await waitFor(() => {
            // Same responsive duplication as the previous test — see comment
            // above. We just need to know the row rendered.
            expect(screen.getAllByText('Pending scan').length).toBeGreaterThan(0);
        });

        expect(screen.getByTitle('Images processing')).toBeInTheDocument();
        expect(document.querySelector('img[src]')).not.toBeInTheDocument();

        await user.click(screen.getAllByRole('button', { name: 'Edit Entry' })[0]);

        const pendingPreviewButton = screen.getByRole('button', { name: 'Image 1' });
        expect(pendingPreviewButton).toBeDisabled();
        expect(screen.getByTitle('Image is processing')).toBeInTheDocument();
        expect(document.querySelector('img[src]')).not.toBeInTheDocument();
    });

    it('shows record authors when the display preference is enabled', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({
            id: 'dentist-1',
            name: 'Dentist',
            email: 'dentist@example.com',
            role: 'dentist',
            account_status: 'active',
            show_record_authors: true,
        });
        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([
            {
                id: 'treatment-authored',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: 9,
                teeth: [9],
                treatment_type: 'Authored history',
                description: null,
                comment: null,
                treatment_date: '2026-04-05',
                cost: null,
                debt_amount: 120000,
                paid_amount: 60000,
                balance: 60000,
                notes: null,
                image_count: 0,
                primary_image: null,
                images: [],
                created_at: '2026-04-05T10:00:00Z',
                updated_at: '2026-04-05T10:00:00Z',
                created_by: { id: 'assistant-1', name: 'Hygienist', role: 'assistant' },
                updated_by: { id: 'assistant-1', name: 'Hygienist', role: 'assistant' },
            },
        ]));

        renderCard();

        expect((await screen.findAllByText('by Hygienist')).length).toBeGreaterThan(0);
    });

    it('keeps the odontogram snapshot and tooth selector hidden', async () => {
        const user = userEvent.setup();

        renderCard();

        await waitFor(() => {
            expect(screen.getAllByText('Davalash').length).toBeGreaterThan(0);
        });

        expect(screen.queryByRole('button', { name: 'Show Snapshot' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Add Entry' }));

        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.queryByTitle('Tooth #18')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Tooth #48')).not.toBeInTheDocument();
    });

    it('labels overpaid remaining summary as an advance without a negative amount', async () => {
        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([
            {
                id: 'treatment-credit',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: 21,
                teeth: [21],
                treatment_type: 'Advance payment',
                description: null,
                comment: null,
                treatment_date: '2026-04-05',
                cost: null,
                debt_amount: 0,
                paid_amount: 60000,
                balance: -60000,
                notes: null,
                image_count: 0,
                primary_image: null,
                images: [],
                created_at: '2026-04-05T10:00:00Z',
                updated_at: '2026-04-05T10:00:00Z',
            },
        ]));

        renderCard();

        expect((await screen.findAllByText('Advance')).length).toBeGreaterThan(0);
        expect(screen.queryAllByText((content) => content.includes('-60') && content.includes('UZS'))).toHaveLength(0);
    });

    it('submits standalone payments without requiring matching debt', async () => {
        const user = userEvent.setup();

        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([]));
        vi.mocked(createPatientTreatment).mockResolvedValue({
            id: 'treatment-credit',
            patient_id: 'patient-1',
            patient_name: 'Sardor',
            patient_phone: '+998 90 123 45 67',
            patient_secondary_phone: null,
            patient_code: 'PT-1001',
            tooth_number: 21,
            teeth: [21],
            treatment_type: 'Advance payment',
            description: null,
            comment: null,
            treatment_date: '2026-04-05',
            cost: null,
            debt_amount: 0,
            paid_amount: 60000,
            balance: -60000,
            notes: null,
            image_count: 0,
            primary_image: null,
            images: [],
            created_at: '2026-04-05T10:00:00Z',
            updated_at: '2026-04-05T10:00:00Z',
        } as never);

        renderCard();

        await user.click(await screen.findByRole('button', { name: 'Add Entry' }));
        await user.clear(screen.getByLabelText(/^Date/i));
        await user.type(screen.getByLabelText(/^Date/i), '2026-04-05');
        await user.type(screen.getByLabelText(/^Entry/i), 'Advance payment');
        await user.type(screen.getByLabelText(/^Description \/ comment/i), 'Paid ahead of treatment');
        await user.clear(screen.getByLabelText(/^Work total/i));
        await user.type(screen.getByLabelText(/^Work total/i), '0');
        await user.clear(screen.getByLabelText(/^Paid/i));
        await user.type(screen.getByLabelText(/^Paid/i), '60000');

        await user.click(screen.getByRole('button', { name: 'Save Changes' }));

        await waitFor(() => {
            expect(createPatientTreatment).toHaveBeenCalledWith('patient-1', expect.objectContaining({
                debt_amount: 0,
                paid_amount: 60000,
                comment: 'Paid ahead of treatment',
                treatment_type: 'Advance payment',
            }));
        });
    });
});
