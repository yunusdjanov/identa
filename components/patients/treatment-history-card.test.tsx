import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/components/providers/i18n-provider';
import { DICTIONARIES } from '@/lib/i18n/dictionaries';
import { TreatmentHistoryCard } from '@/components/patients/treatment-history-card';
import { optimizeImageFilesForUpload } from '@/lib/browser-image';
import {
    createPatientTreatment,
    deletePatientTreatment,
    deletePatientTreatmentImage,
    getCurrentUser,
    getPatientTreatment,
    listAllPatientTreatments,
    listPatientTreatments,
    replacePatientTreatmentImage,
    updatePatientTreatment,
    uploadPatientTreatmentImage,
    uploadPatientTreatmentImages,
} from '@/lib/api/dentist';

vi.mock('@/lib/browser-image', () => ({
    optimizeImageFilesForUpload: vi.fn(async (files: File[]) => files),
}));

vi.mock('@/lib/api/dentist', () => ({
    createPatientTreatment: vi.fn(),
    deletePatientTreatment: vi.fn(),
    deletePatientTreatmentImage: vi.fn(),
    getCurrentUser: vi.fn(),
    getPatientTreatment: vi.fn(),
    listAllPatientTreatments: vi.fn(),
    listPatientTreatments: vi.fn(),
    replacePatientTreatmentImage: vi.fn(),
    updatePatientTreatment: vi.fn(),
    uploadPatientTreatmentImage: vi.fn(),
    uploadPatientTreatmentImages: vi.fn(),
}));

function renderCard(locale: keyof typeof DICTIONARIES = 'en') {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(
        <QueryClientProvider client={queryClient}>
            <I18nProvider initialLocale={locale} initialDictionary={DICTIONARIES[locale]}>
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

function getHeaderSummaryPill(label: string) {
    return screen
        .getAllByText(label)
        .map((element) => element.closest('[data-testid="history-financial-summary-pill"]'))
        .find((pill): pill is HTMLElement => pill instanceof HTMLElement);
}

function normalizeText(value: string | null | undefined) {
    return (value ?? '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
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
        vi.mocked(replacePatientTreatmentImage).mockReset();
        vi.mocked(optimizeImageFilesForUpload).mockClear();
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

        const heading = await screen.findByRole('heading', { name: 'Timeline treatment' });
        const timelineArticle = heading.closest('article') as HTMLElement;

        expect(heading).toBeInTheDocument();
        expect(timelineArticle).toHaveClass('md:grid-cols-[96px_minmax(0,1fr)]');
        expect(within(timelineArticle).getByText('Apr 5')).toBeInTheDocument();
        expect(within(timelineArticle).getByText('2026')).toHaveClass('text-[11px]', 'text-slate-400');
        expect(screen.getByText('Clinical description shown under the title')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 2' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 1' })).toHaveClass('h-36', 'w-full', 'min-w-0', 'lg:h-40');
        expect(screen.getByRole('button', { name: 'Image 1' }).parentElement).toHaveStyle({ gridTemplateColumns: 'repeat(2, minmax(10rem, 18.75rem)) 3.25rem' });
        expect(screen.getByRole('button', { name: 'Upload' })).toHaveClass('h-36', 'w-full', 'min-w-0', 'lg:h-40');
        expect(screen.queryByText(/^Teeth:/i)).not.toBeInTheDocument();
        expect(screen.getAllByText('Remaining')).toHaveLength(1);
    });

    it('keeps the upload tile compact when a timeline entry has no images', async () => {
        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([
            {
                id: 'treatment-empty-images',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: null,
                teeth: [],
                treatment_type: 'No images',
                description: null,
                comment: null,
                treatment_date: '2026-04-05',
                cost: null,
                debt_amount: 0,
                paid_amount: 0,
                balance: 0,
                notes: null,
                image_count: 0,
                primary_image: null,
                images: [],
                created_at: '2026-04-05T10:00:00Z',
                updated_at: '2026-04-05T10:00:00Z',
            },
        ]));

        renderCard();

        expect(await screen.findByRole('heading', { name: 'No images' })).toBeInTheDocument();
        const uploadButton = screen.getByRole('button', { name: 'Upload' });
        expect(uploadButton).toHaveClass('h-20', 'w-full', 'min-w-0');
        expect(uploadButton).not.toHaveClass('h-36', 'lg:h-40');
        expect(uploadButton.parentElement).toHaveStyle({ gridTemplateColumns: '3.25rem' });
    });

    it('renders the financial summary as a centered slim header strip', async () => {
        renderCard();

        await waitFor(() => {
            expect(getHeaderSummaryPill('Work total')).toBeInTheDocument();
        });

        const summaryStrip = screen.getByTestId('patient-history-financial-summary');
        const actions = screen.getByTestId('patient-history-actions');
        const workTotalCard = getHeaderSummaryPill('Work total') as HTMLElement;
        const paidCard = getHeaderSummaryPill('Paid') as HTMLElement;
        const remainingCard = getHeaderSummaryPill('Remaining') as HTMLElement;
        const title = screen.getByText('Work History');

        expect(summaryStrip).toHaveClass('sm:grid-cols-3', 'xl:min-w-[36rem]');
        expect(actions).toHaveClass('xl:justify-self-end');
        expect(workTotalCard).toHaveClass('rounded-xl', 'px-3', 'py-2', 'bg-red-50/45');
        expect(paidCard).toHaveClass('rounded-xl', 'px-3', 'py-2', 'bg-emerald-50/45');
        expect(remainingCard).toHaveClass('rounded-xl', 'px-3', 'py-2');
        expect(title.compareDocumentPosition(summaryStrip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(summaryStrip.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(workTotalCard).not.toHaveClass('interactive-card');
        expect(paidCard).not.toHaveClass('interactive-card');
        expect(remainingCard).not.toHaveClass('interactive-card');
        expect(workTotalCard).not.toHaveTextContent('Debt');
        expect(paidCard).not.toHaveTextContent('Debt');
        expect(remainingCard).toHaveTextContent('Remaining');
    });

    it('hides the settled badge when all financial summary amounts are zero', async () => {
        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([]));

        renderCard();

        await waitFor(() => {
            expect(getHeaderSummaryPill('Remaining')).toHaveTextContent('0 UZS');
        });

        expect(getHeaderSummaryPill('Remaining')).not.toHaveTextContent('Paid');
    });

    it('keeps the settled badge when real work is fully paid', async () => {
        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([
            {
                id: 'treatment-settled',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: null,
                teeth: [],
                treatment_type: 'Settled treatment',
                description: null,
                comment: null,
                treatment_date: '2026-04-05',
                cost: null,
                debt_amount: 120000,
                paid_amount: 120000,
                balance: 0,
                notes: null,
                images: [],
                created_at: '2026-04-05T10:00:00Z',
                updated_at: '2026-04-05T10:00:00Z',
            },
        ]));

        renderCard();

        await waitFor(() => {
            expect(getHeaderSummaryPill('Remaining')).toHaveTextContent('Paid');
        });
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
        expect(screen.getByRole('button', { name: 'Image 1' }).parentElement).toHaveStyle({ gridTemplateColumns: 'repeat(3, minmax(10rem, 18.75rem)) 3.25rem' });
        expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
        expect(screen.queryByText('+1')).not.toBeInTheDocument();
        expect(screen.queryByText('+2')).not.toBeInTheDocument();
    });

    it('keeps the slim upload tile visible when exactly four images are shown', async () => {
        const images = Array.from({ length: 4 }).map((_, index) => ({
            id: `image-four-${index + 1}`,
            mime_type: 'image/jpeg',
            file_size: 1024,
            created_at: `2026-04-05T10:0${index}:00Z`,
            url: `https://example.com/tooth-four-${index + 1}.jpg`,
            thumbnail_url: `https://example.com/tooth-four-${index + 1}-thumb.jpg`,
            preview_url: `https://example.com/tooth-four-${index + 1}-preview.jpg`,
        }));

        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([
            {
                id: 'treatment-four-images',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: null,
                teeth: [],
                treatment_type: 'Four images',
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

        expect(await screen.findByRole('heading', { name: 'Four images' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 4' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 1' }).parentElement).toHaveStyle({ gridTemplateColumns: 'repeat(4, minmax(10rem, 18.75rem)) 3.25rem' });
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
        expect(document.querySelector('.snap-x')).not.toBeInTheDocument();
        expect(document.querySelector('.overflow-x-auto')).not.toBeInTheDocument();
        expect(document.querySelector('.bg-gradient-to-l')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Image 4' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Image 5' })).not.toBeInTheDocument();
        expect(screen.getByText('+4')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Upload' })).toHaveClass('h-36', 'w-full', 'min-w-0', 'lg:h-40');
        expect(screen.getByRole('button', { name: 'Image 1' }).parentElement).toHaveStyle({ gridTemplateColumns: 'repeat(4, minmax(10rem, 18.75rem)) 3.25rem' });
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

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByLabelText(/^Entry/i)).toHaveValue('Davalash');
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

        const heading = await screen.findByRole('heading', { name: 'Authored history' });
        const article = heading.closest('article') as HTMLElement;
        const paidLabel = within(article).getByText('Paid');
        const authorBadgeText = within(article).getByText('by Hygienist');
        const authorBadge = authorBadgeText.closest('span') as HTMLElement;

        expect(authorBadgeText).toBeInTheDocument();
        expect(heading.compareDocumentPosition(authorBadge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(authorBadge.compareDocumentPosition(paidLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('keeps the odontogram snapshot and tooth selector hidden', async () => {
        const user = userEvent.setup();

        renderCard();

        await waitFor(() => {
            expect(screen.getAllByText('Davalash').length).toBeGreaterThan(0);
        });

        expect(screen.queryByRole('button', { name: 'Show Snapshot' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Add Entry' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByLabelText(/^Date/i)).toBeInTheDocument();
        expect(screen.getByText('New entry')).toBeInTheDocument();
        const entryInput = screen.getByLabelText(/^Entry/i);
        const commentInput = screen.getByLabelText(/^Description \/ comment/i);
        expect(entryInput).toBeInTheDocument();
        expect(entryInput).toHaveClass('rounded-xl', 'bg-white');
        expect(commentInput).toHaveAttribute('placeholder', 'For example: protocol, recommendations, or comment');
        const workTotalInput = screen.getByLabelText(/^Work total/i) as HTMLInputElement;
        expect(workTotalInput).toHaveValue('');
        await user.click(workTotalInput);
        await waitFor(() => {
            expect(workTotalInput).toHaveValue('0');
            expect(workTotalInput.selectionStart).toBe(1);
            expect(workTotalInput.selectionEnd).toBe(1);
        });
        await user.type(workTotalInput, '6');
        expect(workTotalInput).toHaveValue('6');
        await user.click(screen.getByRole('button', { name: 'Restoration' }));
        expect(entryInput).toHaveValue('Restoration');
        const uploadTile = screen.getAllByTitle('Upload').find((element) => element.classList.contains('h-24')) as HTMLElement;
        expect(uploadTile).toHaveClass('lg:h-28');
        expect(uploadTile).toHaveTextContent('Upload up to 10 images');
        expect(entryInput.compareDocumentPosition(uploadTile) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(uploadTile.compareDocumentPosition(commentInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.queryByTitle('Tooth #18')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Tooth #48')).not.toBeInTheDocument();
    });

    it('allows images selected on an unsaved entry to open the editor', async () => {
        const user = userEvent.setup();
        const { container } = renderCard();

        await waitFor(() => {
            expect(screen.getAllByText('Davalash').length).toBeGreaterThan(0);
        });

        await user.click(screen.getByRole('button', { name: 'Add Entry' }));

        const formCard = screen.getByText('New entry').closest('article') as HTMLElement;
        const fileInput = container.querySelector<HTMLInputElement>('#historyImages');

        expect(fileInput).toBeInstanceOf(HTMLInputElement);

        await user.upload(
            fileInput as HTMLInputElement,
            new File(['draft-image'], 'draft.jpg', { type: 'image/jpeg' })
        );

        const pendingImageButton = await within(formCard).findByRole('button', { name: 'Image 1' });

        expect(within(formCard).getByRole('button', { name: 'Edit Image 1' })).toBeInTheDocument();

        await user.click(pendingImageButton);

        expect(await screen.findByRole('button', { name: 'Edit' })).toBeEnabled();
    });

    it('localizes treatment suggestion chips by active language', async () => {
        const user = userEvent.setup();

        renderCard('uz');

        await waitFor(() => {
            expect(screen.getAllByText('Davalash').length).toBeGreaterThan(0);
        });

        await user.click(screen.getByRole('button', { name: DICTIONARIES.uz['patientHistory.addEntry'] }));

        const localizedSuggestion = DICTIONARIES.uz['patientHistory.workSuggestion.restoration'];
        expect(screen.getByRole('button', { name: localizedSuggestion })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Реставрация' })).not.toBeInTheDocument();
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

    it('labels mixed currency remaining summary per currency', async () => {
        vi.mocked(listPatientTreatments).mockResolvedValue(treatmentsEnvelope([
            {
                id: 'treatment-uzs-debt',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: 21,
                teeth: [21],
                treatment_type: 'UZS debt',
                description: null,
                comment: null,
                treatment_date: '2026-04-05',
                currency: 'UZS',
                cost: null,
                debt_amount: 1820000,
                paid_amount: 550000,
                balance: 1270000,
                notes: null,
                image_count: 0,
                primary_image: null,
                images: [],
                created_at: '2026-04-05T10:00:00Z',
                updated_at: '2026-04-05T10:00:00Z',
            },
            {
                id: 'treatment-usd-advance',
                patient_id: 'patient-1',
                patient_name: 'Sardor',
                patient_phone: '+998 90 123 45 67',
                patient_secondary_phone: null,
                patient_code: 'PT-1001',
                tooth_number: 22,
                teeth: [22],
                treatment_type: 'USD advance',
                description: null,
                comment: null,
                treatment_date: '2026-04-05',
                currency: 'USD',
                cost: null,
                debt_amount: 200,
                paid_amount: 205,
                balance: -5,
                notes: null,
                image_count: 0,
                primary_image: null,
                images: [],
                created_at: '2026-04-05T10:01:00Z',
                updated_at: '2026-04-05T10:01:00Z',
            },
        ]));

        renderCard();

        await waitFor(() => {
            expect(getHeaderSummaryPill('Remaining')).toHaveTextContent('USD');
        });

        const remainingCard = getHeaderSummaryPill('Remaining') as HTMLElement;
        const remainingText = normalizeText(remainingCard.textContent);

        expect(remainingText).toContain('1 270 000 UZS');
        expect(remainingText).toContain('5 USD');
        expect(within(remainingCard).getByText('Debt')).toBeInTheDocument();
        expect(within(remainingCard).getByText('Advance')).toBeInTheDocument();
        expect(within(remainingCard).queryByText('Paid')).not.toBeInTheDocument();
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
        await user.type(screen.getByLabelText(/^Work total/i), '500,000');
        await user.clear(screen.getByLabelText(/^Paid/i));
        await user.type(screen.getByLabelText(/^Paid/i), '60000');
        expect(screen.getByLabelText(/^Work total/i)).toHaveAttribute('type', 'text');
        expect(screen.getByLabelText(/^Work total/i)).toHaveValue('500 000');
        expect(screen.getByLabelText(/^Paid/i)).toHaveValue('60 000');

        await user.click(screen.getByRole('button', { name: 'Save Changes' }));

        await waitFor(() => {
            expect(createPatientTreatment).toHaveBeenCalledWith('patient-1', expect.objectContaining({
                debt_amount: 500000,
                paid_amount: 60000,
                comment: 'Paid ahead of treatment',
                treatment_type: 'Advance payment',
            }));
        });
    });
});
