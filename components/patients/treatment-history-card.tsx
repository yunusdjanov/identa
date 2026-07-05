'use client';

import dynamic from 'next/dynamic';
import { type ChangeEvent, type FocusEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { type InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
    uploadPatientTreatmentImages,
} from '@/lib/api/dentist';
import type { ApiCollectionEnvelope, ApiMoneyCurrency, ApiTreatment, ApiTreatmentImage } from '@/lib/api/types';
import { getApiErrorMessage } from '@/lib/api/client';
import { useI18n } from '@/components/providers/i18n-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { PreviewGalleryImage } from '@/components/patients/patient-photo-preview-dialog';
import { optimizeImageFilesForUpload } from '@/lib/browser-image';
import { getProtectedMediaCrossOrigin, getProtectedMediaPreviewUrl, getProtectedMediaThumbnailUrl, isProtectedMediaApproved } from '@/lib/protected-media';
import { formatToothList } from '@/lib/tooth-numbering';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { formatCurrency, formatDate, toLocalDateKey } from '@/lib/utils';
import { toast } from 'sonner';
import { CalendarDays, Download, Loader2, Lock, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { buildPdfFilename, exportPatientReportToPdf } from '@/lib/export/pdf';
import { EmptyState } from '@/components/ui/empty-state';
import { canManage, canView, getManageDeniedMessage, isSubscriptionReadOnly } from '@/lib/auth/permissions';
import { RecordAuthorBadge } from '@/components/ui/record-author-badge';
import { rememberPatientListFocus } from '@/lib/patients/patient-list-state';

interface TreatmentHistoryCardProps {
    patientId: string;
    patientName: string;
}

interface TreatmentFormState {
    treatmentDate: string;
    treatmentType: string;
    comment: string;
    debtAmount: string;
    paidAmount: string;
    currency: ApiMoneyCurrency;
    teeth: number[];
    imageFiles: File[];
    removeImageIds: string[];
}

const MAX_HISTORY_IMAGES_PER_ENTRY = 10;
const DEFAULT_HISTORY_UPLOAD_MAX_MB = 1;
const ALLOWED_HISTORY_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);
const HISTORY_IMAGE_UPLOAD_CONCURRENCY = 10;
const MEDIA_READINESS_POLL_INTERVAL_MS = 1200;
const MEDIA_READINESS_TIMEOUT_MS = 8000;
const HISTORY_TIMELINE_IMAGE_LIMIT = 4;
const HISTORY_PAGE_SIZE = 10;
const HISTORY_SORT = '-treatment_date,-created_at';
const HISTORY_TIMELINE_IMAGE_TILE_CLASS = 'h-36 w-full min-w-0 lg:h-40';
const HISTORY_TIMELINE_ADD_TILE_CLASS = 'h-36 w-full min-w-0 lg:h-40';
const HISTORY_TIMELINE_EMPTY_ADD_TILE_CLASS = 'h-20 w-full min-w-0';
const HISTORY_TIMELINE_IMAGE_COLUMN_WIDTH = '18.75rem';
const HISTORY_TIMELINE_IMAGE_COLUMN_MIN_WIDTH = '10rem';
const HISTORY_TIMELINE_ADD_COLUMN_WIDTH = '3.25rem';
const HISTORY_WORK_DONE_SUGGESTION_KEYS = [
    'patientHistory.workSuggestion.restoration',
    'patientHistory.workSuggestion.endodontics',
    'patientHistory.workSuggestion.extraction',
    'patientHistory.workSuggestion.implantation',
    'patientHistory.workSuggestion.whitening',
    'patientHistory.workSuggestion.prosthodontics',
    'patientHistory.workSuggestion.cleaning',
] as const;
const TREATMENT_CURRENCIES: ApiMoneyCurrency[] = ['UZS', 'USD'];

type TreatmentHistoryPages = InfiniteData<ApiCollectionEnvelope<ApiTreatment>, number>;
type TreatmentCurrencyTotals = Record<ApiMoneyCurrency, {
    totalDebt: number;
    totalPaid: number;
    netBalance: number;
}>;
type TreatmentMoneyField = 'totalDebt' | 'totalPaid' | 'netBalance';
type TranslateFn = ReturnType<typeof useI18n>['t'];

const PatientPhotoPreviewDialog = dynamic(
    () => import('@/components/patients/patient-photo-preview-dialog').then((module) => module.PatientPhotoPreviewDialog),
    { ssr: false }
);

function getBalanceStatusKey(balance: number) {
    if (balance < 0) {
        return 'patientHistory.balanceStatus.advance';
    }

    if (balance === 0) {
        return 'patientHistory.balanceStatus.paid';
    }

    return 'patientHistory.balanceStatus.debt';
}

function shouldShowBalanceStatus(totalDebt: number, totalPaid: number, balance: number) {
    return totalDebt !== 0 || totalPaid !== 0 || balance !== 0;
}

function splitTimelineDate(date: string) {
    const formatted = formatDate(date);
    const match = formatted.match(/^(.*?)(?:,?\s+)(\d{4}(?:\s*г\.)?)$/u);

    if (!match) {
        return { primary: formatted, year: null };
    }

    return {
        primary: match[1].trim(),
        year: match[2].trim(),
    };
}

function TimelineDate({ date }: { date: string }) {
    const { primary, year } = splitTimelineDate(date);

    return (
        <span className="text-right text-xs font-semibold leading-4 tabular-nums text-slate-500">
            <span className="block truncate">{primary}</span>
            {year ? <span className="block text-[11px] leading-3 text-slate-400">{year}</span> : null}
        </span>
    );
}

const createEmptyFormState = (): TreatmentFormState => ({
    treatmentDate: toLocalDateKey(),
    treatmentType: '',
    comment: '',
    debtAmount: '',
    paidAmount: '',
    currency: 'UZS',
    teeth: [],
    imageFiles: [],
    removeImageIds: [],
});

function formatTeeth(teeth: number[]) {
    return formatToothList(teeth);
}

function validateHistoryImageFile(
    file: File,
    t: (key: string, params?: Record<string, string | number>) => string,
    maxBytes: number,
    maxMb: number
) {
    if (!file) {
        return '';
    }

    const normalizedName = file.name.toLowerCase();
    const hasAllowedExtension = ['.jpg', '.jpeg', '.png', '.webp'].some((extension) => normalizedName.endsWith(extension));
    const hasAllowedType = ALLOWED_HISTORY_IMAGE_TYPES.has(file.type);

    if (!hasAllowedType && !hasAllowedExtension) {
        return t('patientHistory.validation.imageType');
    }

    if (file.size > maxBytes) {
        return t('patientHistory.validation.imageSize', { sizeMb: maxMb });
    }

    return '';
}

function getVisibleTreatmentImages(treatment: ApiTreatment, removeImageIds: string[]) {
    return (treatment.images ?? []).filter((image) => !removeImageIds.includes(image.id));
}

function getTreatmentImageThumbnailUrl(image: ApiTreatmentImage) {
    return getProtectedMediaThumbnailUrl({
        scanStatus: image.scan_status,
        thumbnailUrl: image.thumbnail_url,
        thumbnailReady: image.thumbnail_ready,
        previewUrl: image.preview_url,
        previewReady: image.preview_ready,
        url: image.url,
        allowFullFallback: true,
    });
}

function getTreatmentImagePreviewUrl(image: ApiTreatmentImage) {
    return getProtectedMediaPreviewUrl({
        scanStatus: image.scan_status,
        previewUrl: image.preview_url,
        url: image.url,
    });
}

function delay(ms: number) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

function getTreatmentImageCount(treatment: ApiTreatment) {
    return Math.max(
        Number(treatment.image_count ?? 0),
        treatment.images?.length ?? 0,
        treatment.primary_image ? 1 : 0
    );
}

function getKnownTreatmentImages(treatment: ApiTreatment) {
    if ((treatment.images?.length ?? 0) > 0) {
        return treatment.images;
    }

    return treatment.primary_image ? [treatment.primary_image] : [];
}

function hasCompleteTreatmentImages(treatment: ApiTreatment) {
    const expectedImageCount = getTreatmentImageCount(treatment);

    if (expectedImageCount === 0) {
        return true;
    }

    return getKnownTreatmentImages(treatment).length >= expectedImageCount;
}

function getPreviewableTreatmentImages(treatment: ApiTreatment) {
    return getKnownTreatmentImages(treatment).filter((image) => getTreatmentImagePreviewUrl(image));
}

function coerceTreatmentCurrency(value: string | null | undefined): ApiMoneyCurrency {
    return value === 'USD' ? 'USD' : 'UZS';
}

function formatAmountInput(value: string | number | null | undefined, currency: ApiMoneyCurrency = 'UZS') {
    if (currency === 'USD') {
        const normalized = String(value ?? '')
            .replace(',', '.')
            .replace(/[^\d.]/g, '')
            .replace(/(\..*)\./g, '$1');
        const [whole = '', fraction = ''] = normalized.split('.');
        const normalizedWhole = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

        return fraction !== '' || normalized.endsWith('.')
            ? `${normalizedWhole || '0'}.${fraction.slice(0, 2)}`
            : normalizedWhole;
    }

    const rawValue = typeof value === 'number' ? String(Math.round(value)) : String(value ?? '');
    const digits = rawValue.replace(/\D/g, '');
    const normalizedDigits = digits.replace(/^0+(?=\d)/, '');

    return normalizedDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function parseAmountInput(value: string, currency: ApiMoneyCurrency = 'UZS') {
    if (currency === 'USD') {
        const normalized = value.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
        const amount = Number(normalized);

        return Number.isFinite(amount) ? amount : 0;
    }

    const digits = value.replace(/\D/g, '');

    return digits ? Number(digits) : 0;
}

function createEmptyCurrencyTotals(): TreatmentCurrencyTotals {
    return {
        UZS: { totalDebt: 0, totalPaid: 0, netBalance: 0 },
        USD: { totalDebt: 0, totalPaid: 0, netBalance: 0 },
    };
}

function getCurrencyTotalsFromMeta(value: unknown): TreatmentCurrencyTotals | null {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const totals = createEmptyCurrencyTotals();
    let hasAnyValue = false;

    for (const currency of TREATMENT_CURRENCIES) {
        const raw = (value as Record<string, unknown>)[currency];
        if (!raw || typeof raw !== 'object') {
            continue;
        }

        const totalDebt = Number((raw as Record<string, unknown>).total_debt ?? 0);
        const totalPaid = Number((raw as Record<string, unknown>).total_paid ?? 0);
        const totalBalance = Number((raw as Record<string, unknown>).total_balance ?? 0);

        totals[currency] = {
            totalDebt: Number.isFinite(totalDebt) ? totalDebt : 0,
            totalPaid: Number.isFinite(totalPaid) ? totalPaid : 0,
            netBalance: Number.isFinite(totalBalance) ? totalBalance : 0,
        };

        hasAnyValue = hasAnyValue
            || totals[currency].totalDebt !== 0
            || totals[currency].totalPaid !== 0
            || totals[currency].netBalance !== 0;
    }

    return hasAnyValue ? totals : null;
}

function getCurrencyTotalsFromTreatments(treatments: ApiTreatment[]): TreatmentCurrencyTotals {
    const totals = createEmptyCurrencyTotals();

    for (const treatment of treatments) {
        const currency = coerceTreatmentCurrency(treatment.currency);
        const debt = Number(treatment.debt_amount ?? 0);
        const paid = Number(treatment.paid_amount ?? 0);

        totals[currency].totalDebt += Number.isFinite(debt) ? debt : 0;
        totals[currency].totalPaid += Number.isFinite(paid) ? paid : 0;
        totals[currency].netBalance = totals[currency].totalDebt - totals[currency].totalPaid;
    }

    return totals;
}

function getVisibleMoneyLines(totals: TreatmentCurrencyTotals, field: TreatmentMoneyField) {
    const lines = TREATMENT_CURRENCIES
        .map((currency) => ({
            currency,
            amount: field === 'netBalance' ? Math.abs(totals[currency][field]) : totals[currency][field],
            rawAmount: totals[currency][field],
        }))
        .filter(({ amount, rawAmount }) => amount !== 0 || rawAmount !== 0);

    return lines.length > 0 ? lines : [{ currency: 'UZS' as const, amount: 0, rawAmount: 0 }];
}

function formatMoneyBreakdown(totals: TreatmentCurrencyTotals, field: TreatmentMoneyField) {
    return getVisibleMoneyLines(totals, field)
        .map(({ currency, amount }) => formatCurrency(amount, currency))
        .join(' / ');
}

function hasMixedCurrencyBalanceStatus(totals: TreatmentCurrencyTotals) {
    const activeBalances = TREATMENT_CURRENCIES
        .map((currency) => totals[currency].netBalance)
        .filter((balance) => balance !== 0);

    return activeBalances.some((balance) => balance > 0) && activeBalances.some((balance) => balance < 0);
}

function getInlineBalanceBadgeClassName(balance: number) {
    if (balance < 0) {
        return 'border-blue-200 bg-blue-50 text-blue-700';
    }

    if (balance > 0) {
        return 'border-yellow-200 bg-yellow-50 text-yellow-700';
    }

    return 'border-slate-200 bg-slate-50 text-slate-600';
}

function renderMoneyBreakdownWithBalanceStatuses(totals: TreatmentCurrencyTotals, t: TranslateFn) {
    return (
        <div className="flex flex-col gap-0.5 whitespace-normal leading-tight">
            {getVisibleMoneyLines(totals, 'netBalance').map(({ currency, amount, rawAmount }) => (
                <span key={currency} className="flex flex-wrap items-center gap-1.5">
                    <span className="whitespace-nowrap tabular-nums">{formatCurrency(amount, currency)}</span>
                    {rawAmount !== 0 ? (
                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${getInlineBalanceBadgeClassName(rawAmount)}`}>
                            {t(getBalanceStatusKey(rawAmount))}
                        </span>
                    ) : null}
                </span>
            ))}
        </div>
    );
}

function getHistoryFinancialPillToneClasses(tone: 'red' | 'emerald' | 'blue' | 'yellow' | 'slate') {
    switch (tone) {
        case 'red':
            return 'border-red-100 bg-red-50/45 text-red-700';
        case 'emerald':
            return 'border-emerald-100 bg-emerald-50/45 text-emerald-700';
        case 'blue':
            return 'border-blue-100 bg-blue-50/45 text-blue-700';
        case 'yellow':
            return 'border-yellow-100 bg-yellow-50/45 text-amber-700';
        case 'slate':
        default:
            return 'border-slate-200 bg-slate-50/70 text-slate-700';
    }
}

function HistoryFinancialPill({
    label,
    value,
    tone,
    badge,
    locked,
}: {
    label: string;
    value: ReactNode;
    tone: 'red' | 'emerald' | 'blue' | 'yellow' | 'slate';
    badge?: string | null;
    locked: boolean;
}) {
    return (
        <div
            data-testid="history-financial-summary-pill"
            className={`min-w-0 rounded-lg border px-2.5 py-1.5 shadow-sm shadow-slate-100/50 ${getHistoryFinancialPillToneClasses(tone)}`}
        >
            <div className="flex min-w-0 items-center gap-1">
                <span className="truncate text-[9px] font-bold uppercase leading-3 tracking-[0.11em] text-slate-400">
                    {label}
                </span>
                {badge ? (
                    <span className="shrink-0 rounded-full border border-current/20 bg-white/55 px-1.5 py-0.5 text-[9px] font-bold leading-none">
                        {badge}
                    </span>
                ) : null}
            </div>
            <div className="mt-0.5 min-w-0 truncate text-[13px] font-bold leading-5 tabular-nums">
                {locked ? <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" />***</span> : value}
            </div>
        </div>
    );
}

function getMultiCurrencyBalanceTone(totals: TreatmentCurrencyTotals) {
    const activeBalances = TREATMENT_CURRENCIES
        .map((currency) => totals[currency].netBalance)
        .filter((balance) => balance !== 0);

    if (activeBalances.length === 0) {
        return 'slate' as const;
    }

    if (activeBalances.every((balance) => balance < 0)) {
        return 'blue' as const;
    }

    if (activeBalances.every((balance) => balance > 0)) {
        return 'yellow' as const;
    }

    return 'slate' as const;
}

function getMultiCurrencyBalanceStatusKey(totals: TreatmentCurrencyTotals) {
    const activeBalances = TREATMENT_CURRENCIES
        .map((currency) => totals[currency].netBalance)
        .filter((balance) => balance !== 0);

    if (activeBalances.length === 0) {
        const hasAnyActivity = TREATMENT_CURRENCIES.some((currency) => (
            totals[currency].totalDebt !== 0 || totals[currency].totalPaid !== 0
        ));

        return hasAnyActivity ? 'patientHistory.balanceStatus.paid' : null;
    }

    if (activeBalances.every((balance) => balance < 0)) {
        return 'patientHistory.balanceStatus.advance';
    }

    if (activeBalances.every((balance) => balance > 0)) {
        return 'patientHistory.balanceStatus.debt';
    }

    return null;
}

function reformatTreatmentAmountForCurrency(value: string, fromCurrency: ApiMoneyCurrency, toCurrency: ApiMoneyCurrency) {
    const parsedValue = parseAmountInput(value, fromCurrency);

    if (parsedValue <= 0) {
        return '';
    }

    return formatAmountInput(toCurrency === 'UZS' ? Math.round(parsedValue) : parsedValue, toCurrency);
}

function moveTextInputCaretToEnd(input: HTMLInputElement) {
    const scheduleFrame = typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (callback: FrameRequestCallback) => window.setTimeout(callback, 0);

    scheduleFrame(() => {
        const caretPosition = input.value.length;
        input.setSelectionRange(caretPosition, caretPosition);
    });
}

function getHistoryImageGridTemplateColumns(visibleImageCount: number, canAddImages: boolean) {
    const clampedImageCount = Math.min(Math.max(visibleImageCount, 0), HISTORY_TIMELINE_IMAGE_LIMIT);
    const imageColumns = clampedImageCount > 0
        ? `repeat(${clampedImageCount}, minmax(${HISTORY_TIMELINE_IMAGE_COLUMN_MIN_WIDTH}, ${HISTORY_TIMELINE_IMAGE_COLUMN_WIDTH}))`
        : '';

    if (!canAddImages) {
        return imageColumns;
    }

    return [imageColumns, HISTORY_TIMELINE_ADD_COLUMN_WIDTH].filter(Boolean).join(' ');
}

function buildPreviewGalleryImages(
    images: ApiTreatmentImage[],
    patientName: string,
    imageLabel: string,
    treatmentDate: string
) {
    return images.map((image, index) => ({
        id: image.id,
        src: getTreatmentImagePreviewUrl(image) ?? '',
        thumbnailSrc: getTreatmentImageThumbnailUrl(image) ?? undefined,
        alt: `${patientName} ${imageLabel} ${index + 1}`,
        title: `${imageLabel} ${index + 1} - ${formatDate(treatmentDate)}`,
    }));
}

function createTreatmentFormState(treatment?: ApiTreatment | null): TreatmentFormState {
    return {
        treatmentDate: treatment?.treatment_date ?? toLocalDateKey(),
        treatmentType: treatment?.treatment_type ?? '',
        comment: treatment?.comment ?? treatment?.description ?? '',
        currency: coerceTreatmentCurrency(treatment?.currency),
        debtAmount: treatment?.debt_amount ? formatAmountInput(Number(treatment.debt_amount), coerceTreatmentCurrency(treatment?.currency)) : '',
        paidAmount: treatment?.paid_amount ? formatAmountInput(Number(treatment.paid_amount), coerceTreatmentCurrency(treatment?.currency)) : '',
        teeth: treatment?.teeth ?? [],
        imageFiles: [],
        removeImageIds: [],
    };
}

async function uploadTreatmentImagesInBatches(
    imageFiles: File[],
    uploadFiles: (files: File[]) => Promise<number>
) {
    let failedCount = 0;

    for (let start = 0; start < imageFiles.length; start += HISTORY_IMAGE_UPLOAD_CONCURRENCY) {
        const batch = imageFiles.slice(start, start + HISTORY_IMAGE_UPLOAD_CONCURRENCY);
        failedCount += await uploadFiles(batch);
    }

    return failedCount;
}

function HistoryFinanceChip({
    label,
    value,
    tone,
    locked,
    valueClassName,
}: {
    label: string;
    value: string;
    tone: 'red' | 'green' | 'balance';
    locked: boolean;
    valueClassName?: string;
}) {
    const toneClass = tone === 'red'
        ? 'text-red-700'
        : tone === 'green'
            ? 'text-green-700'
            : 'text-slate-800';

    return (
        <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5">
            <p className="truncate text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
            {locked ? (
                <span className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs font-semibold text-slate-300">
                    <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{value}</span>
                </span>
            ) : (
                <p className={`mt-0.5 truncate text-xs font-bold tabular-nums ${valueClassName ?? toneClass}`}>{value}</p>
            )}
        </div>
    );
}

function HistoryImageStrip({
    treatment,
    patientName,
    imageLabel,
    emptyLabel,
    addImageLabel,
    uploadingLabel,
    processingLabel,
    isDetailLoading,
    isSyncing,
    canAddImages,
    onOpen,
    onAddImage,
}: {
    treatment: ApiTreatment;
    patientName: string;
    imageLabel: string;
    emptyLabel: string;
    addImageLabel: string;
    uploadingLabel: string;
    processingLabel: string;
    isDetailLoading: boolean;
    isSyncing: boolean;
    canAddImages: boolean;
    onOpen: (startIndex: number) => void;
    onAddImage: () => void;
}) {
    const imageCount = getTreatmentImageCount(treatment);
    const knownImages = getKnownTreatmentImages(treatment);
    const visibleImages = knownImages.slice(0, HISTORY_TIMELINE_IMAGE_LIMIT);
    const gridTemplateColumns = getHistoryImageGridTemplateColumns(visibleImages.length, canAddImages);

    if (isSyncing) {
        return <HistoryImageStatus label={uploadingLabel} />;
    }

    if (imageCount === 0) {
        return canAddImages ? (
            <div className="grid min-w-0 justify-start gap-2 pb-1" style={{ gridTemplateColumns: getHistoryImageGridTemplateColumns(0, true) }}>
                <HistoryAddImageButton label={addImageLabel} onClick={onAddImage} compact />
            </div>
        ) : (
            <p className="text-xs font-medium text-slate-400">{emptyLabel}</p>
        );
    }

    if (visibleImages.length === 0) {
        return canAddImages ? (
            <div className="grid min-w-0 justify-start gap-2 pb-1" style={{ gridTemplateColumns: getHistoryImageGridTemplateColumns(1, true) }}>
                <HistoryImageStatus label={processingLabel} />
                <HistoryAddImageButton label={addImageLabel} onClick={onAddImage} />
            </div>
        ) : (
            <HistoryImageStatus label={processingLabel} />
        );
    }

    return (
        <div className="relative min-w-0">
            <div className="grid min-w-0 justify-start gap-2 pb-1" style={{ gridTemplateColumns }}>
                {visibleImages.map((image, index) => (
                    <HistoryTimelineImageButton
                        key={image.id}
                        image={image}
                        index={index}
                        hiddenCount={index === visibleImages.length - 1 ? Math.max(imageCount - visibleImages.length, 0) : 0}
                        patientName={patientName}
                        imageLabel={imageLabel}
                        processingLabel={processingLabel}
                        disabled={isDetailLoading}
                        onOpen={onOpen}
                    />
                ))}
                {canAddImages ? <HistoryAddImageButton label={addImageLabel} onClick={onAddImage} /> : null}
            </div>
        </div>
    );
}

function HistoryImageStatus({ label }: { label: string }) {
    return (
        <span
            className={`inline-flex ${HISTORY_TIMELINE_IMAGE_TILE_CLASS} items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700`}
            title={label}
            aria-label={label}
        >
            <Loader2 className="h-4 w-4 animate-spin" />
        </span>
    );
}

function HistoryTimelineImageButton({
    image,
    index,
    hiddenCount,
    patientName,
    imageLabel,
    processingLabel,
    disabled,
    onOpen,
}: {
    image: ApiTreatmentImage;
    index: number;
    hiddenCount: number;
    patientName: string;
    imageLabel: string;
    processingLabel: string;
    disabled: boolean;
    onOpen: (startIndex: number) => void;
}) {
    const thumbnailUrl = getTreatmentImageThumbnailUrl(image);
    const isReady = isProtectedMediaApproved(image.scan_status) && Boolean(thumbnailUrl);

    if (!isReady || !thumbnailUrl) {
        return <HistoryImageStatus label={processingLabel} />;
    }

    return (
        <button
            type="button"
            className={`group relative ${HISTORY_TIMELINE_IMAGE_TILE_CLASS} overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm transition-all hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-70`}
            disabled={disabled}
            onClick={() => onOpen(index)}
            aria-label={`${imageLabel} ${index + 1}`}
            title={`${imageLabel} ${index + 1}`}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={thumbnailUrl}
                alt={`${patientName} ${imageLabel} ${index + 1}`}
                crossOrigin={getProtectedMediaCrossOrigin(thumbnailUrl)}
                className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                loading="lazy"
            />
            <span className="absolute right-1.5 top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-900/75 px-1.5 text-[10px] font-bold text-white">
                {hiddenCount > 0 ? `+${hiddenCount}` : index + 1}
            </span>
        </button>
    );
}

function HistoryAddImageButton({
    label,
    onClick,
    compact = false,
}: {
    label: string;
    onClick: () => void;
    compact?: boolean;
}) {
    return (
        <button
            type="button"
            className={`group inline-flex ${compact ? HISTORY_TIMELINE_EMPTY_ADD_TILE_CLASS : HISTORY_TIMELINE_ADD_TILE_CLASS} items-center justify-center rounded-xl border border-dashed border-teal-200 bg-teal-50/60 text-teal-700 transition-all hover:border-teal-300 hover:bg-teal-50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1`}
            onClick={onClick}
            aria-label={label}
            title={label}
        >
            <Plus className="h-5 w-5 transition-transform group-hover:scale-110" />
        </button>
    );
}

export function TreatmentHistoryCard({ patientId, patientName }: TreatmentHistoryCardProps) {
    const { t, locale } = useI18n();
    const queryClient = useQueryClient();
    const treatmentsQueryKey = ['patients', 'detail', patientId, 'treatments'] as const;
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingTreatment, setEditingTreatment] = useState<ApiTreatment | null>(null);
    const [treatmentToDelete, setTreatmentToDelete] = useState<ApiTreatment | null>(null);
    const [previewGallery, setPreviewGallery] = useState<{
        images: PreviewGalleryImage[];
        startIndex: number;
        fallbackTitle: string;
        treatmentId: string;
        treatmentDate: string;
    } | null>(null);
    const [mediaSyncingTreatmentIds, setMediaSyncingTreatmentIds] = useState<string[]>([]);
    const [formState, setFormState] = useState<TreatmentFormState>(createEmptyFormState);
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [detailLoadingTreatmentId, setDetailLoadingTreatmentId] = useState<string | null>(null);
    const [isPreparingImages, setIsPreparingImages] = useState(false);
    const [isSavingPendingImageEdit, setIsSavingPendingImageEdit] = useState(false);

    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });
    const showRecordAuthors = currentUserQuery.data?.show_record_authors === true;
    const subscription = currentUserQuery.data?.subscription;
    const maxHistoryImagesPerEntry = subscription?.entry_image_limit ?? MAX_HISTORY_IMAGES_PER_ENTRY;
    const maxHistoryUploadMb = subscription?.upload_max_mb ?? DEFAULT_HISTORY_UPLOAD_MAX_MB;
    const maxHistoryUploadBytes = maxHistoryUploadMb * 1024 * 1024;
    const historyImageLabel = t('patientHistory.image');

    const treatmentsQuery = useInfiniteQuery({
        queryKey: treatmentsQueryKey,
        initialPageParam: 1,
        queryFn: ({ pageParam }) => listPatientTreatments(patientId, {
            page: pageParam,
            perPage: HISTORY_PAGE_SIZE,
            sort: HISTORY_SORT,
            includeImages: true,
            includeSummary: pageParam === 1,
        }),
        getNextPageParam: (lastPage) => {
            const pagination = lastPage.meta?.pagination;
            if (!pagination || pagination.page >= pagination.total_pages) {
                return undefined;
            }

            return pagination.page + 1;
        },
        staleTime: 30_000,
        gcTime: 300_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const treatments = useMemo(() => {
        const items = [...(treatmentsQuery.data?.pages.flatMap((page) => page.data) ?? [])];
        items.sort((a, b) => {
            const dateCompare = (b.treatment_date ?? '').localeCompare(a.treatment_date ?? '');
            if (dateCompare !== 0) {
                return dateCompare;
            }
            return (b.created_at ?? '').localeCompare(a.created_at ?? '');
        });
        return items;
    }, [treatmentsQuery.data]);
    const summary = useMemo(() => {
        const metaSummary = treatmentsQuery.data?.pages.find((page) => page.meta?.summary)?.meta?.summary;
        const totalsByCurrency = getCurrencyTotalsFromMeta(metaSummary?.totals_by_currency)
            ?? getCurrencyTotalsFromTreatments(treatments);
        const totalDebt = totalsByCurrency.UZS.totalDebt;
        const totalPaid = totalsByCurrency.UZS.totalPaid;
        const netBalance = totalDebt - totalPaid;

        return {
            totalDebt,
            totalPaid,
            netBalance,
            totalsByCurrency,
        };
    }, [treatments, treatmentsQuery.data]);
    const netBalanceTone = getMultiCurrencyBalanceTone(summary.totalsByCurrency);
    const netBalanceStatusKey = getMultiCurrencyBalanceStatusKey(summary.totalsByCurrency);
    const hasMixedNetBalanceStatus = hasMixedCurrencyBalanceStatus(summary.totalsByCurrency);

    const invalidateHistory = () => {
        queryClient.invalidateQueries({ queryKey: treatmentsQueryKey });
    };

    const getTreatmentDetailQueryKey = (treatmentId: string) => (
        ['patients', 'detail', patientId, 'treatments', treatmentId] as const
    );

    const mergeTreatmentIntoCaches = (updatedTreatment: ApiTreatment) => {
        queryClient.setQueryData<ApiTreatment>(
            getTreatmentDetailQueryKey(updatedTreatment.id),
            updatedTreatment
        );
    };

    const refreshHistory = async (updatedTreatment?: ApiTreatment) => {
        if (updatedTreatment) {
            mergeTreatmentIntoCaches(updatedTreatment);
        }

        await queryClient.invalidateQueries({ queryKey: treatmentsQueryKey });
    };

    const loadTreatmentDetail = async (treatment: ApiTreatment): Promise<ApiTreatment> => {
        if (hasCompleteTreatmentImages(treatment)) {
            return treatment;
        }

        const detailQueryKey = getTreatmentDetailQueryKey(treatment.id);
        const cachedDetail = queryClient.getQueryData<ApiTreatment>(detailQueryKey);

        if (cachedDetail && hasCompleteTreatmentImages(cachedDetail)) {
            return cachedDetail;
        }

        const detailedTreatment = await queryClient.fetchQuery({
            queryKey: detailQueryKey,
            queryFn: () => getPatientTreatment(patientId, treatment.id),
            staleTime: 0,
            gcTime: 300_000,
        });

        if (!detailedTreatment) {
            throw new Error('Treatment detail not found');
        }

        return detailedTreatment;
    };

    const waitForTreatmentMediaReady = async (treatmentId: string, expectedImageCount: number): Promise<ApiTreatment> => {
        const deadline = Date.now() + MEDIA_READINESS_TIMEOUT_MS;

        while (Date.now() < deadline) {
            const detail = await queryClient.fetchQuery({
                queryKey: ['patients', 'detail', patientId, 'treatments', treatmentId],
                queryFn: () => getPatientTreatment(patientId, treatmentId),
                staleTime: 0,
                gcTime: 300_000,
            });

            const images = detail.images ?? [];
            const hasExpectedImages = images.filter((image) => getTreatmentImagePreviewUrl(image)).length >= expectedImageCount;
            if (hasExpectedImages) {
                return detail;
            }

            await delay(MEDIA_READINESS_POLL_INTERVAL_MS);
        }

        const detailedTreatment = await queryClient.fetchQuery({
            queryKey: getTreatmentDetailQueryKey(treatmentId),
            queryFn: () => getPatientTreatment(patientId, treatmentId),
            staleTime: 0,
            gcTime: 300_000,
        });

        if (!detailedTreatment) {
            throw new Error('Treatment detail not found');
        }

        return detailedTreatment;
    };

    const saveTreatmentMutation = useMutation({
        mutationFn: async () => {
            // Only include financial fields in the payload if the viewer
            // can see them. Backend `TreatmentService::payload` ignores
            // them too if the actor lacks `payments.view`, so this is
            // defense-in-depth — even a tampered client can't sneak in
            // debt/paid values it shouldn't be able to set, and a
            // legitimate client doesn't accidentally send empty 0s that
            // would wipe the dentist owner's existing values on update.
            const payload = {
                treatment_date: formState.treatmentDate,
                treatment_type: formState.treatmentType.trim(),
                comment: formState.comment.trim() || undefined,
                teeth: formState.teeth,
                tooth_number: formState.teeth[0] ?? null,
                ...(canViewFinancials ? {
                    debt_amount: parseAmountInput(formState.debtAmount, formState.currency),
                    paid_amount: parseAmountInput(formState.paidAmount, formState.currency),
                    currency: formState.currency,
                } : {}),
            };
            const treatment = editingTreatment
                ? await updatePatientTreatment(patientId, editingTreatment.id, payload)
                : await createPatientTreatment(patientId, payload);

            const removeImageIds = [...formState.removeImageIds];
            const imageFiles = [...formState.imageFiles];
            const treatmentId = treatment.id;

            if (removeImageIds.length > 0 || imageFiles.length > 0) {
                void (async () => {
                    let hasMediaSyncFailure = false;
                    let refreshedTreatment: ApiTreatment | undefined;

                    try {
                        const expectedImageCount = Math.max(
                            0,
                            getTreatmentImageCount(treatment) - removeImageIds.length + imageFiles.length
                        );

                        if (removeImageIds.length > 0) {
                            const deleteResults = await Promise.allSettled(
                                removeImageIds.map((imageId) =>
                                    deletePatientTreatmentImage(patientId, treatment.id, imageId)
                                )
                            );

                            hasMediaSyncFailure = deleteResults.some((result) => result.status === 'rejected');
                        }

                        if (imageFiles.length > 0) {
                            const failedUploadCount = await uploadTreatmentImagesInBatches(
                                imageFiles,
                                (imageBatch) => uploadPatientTreatmentImages(patientId, treatment.id, imageBatch)
                            );

                            hasMediaSyncFailure = hasMediaSyncFailure || failedUploadCount > 0;
                        }

                        if (!hasMediaSyncFailure) {
                            refreshedTreatment = await waitForTreatmentMediaReady(treatment.id, expectedImageCount);
                        }
                    } catch {
                        hasMediaSyncFailure = true;
                    } finally {
                        if (hasMediaSyncFailure) {
                            toast.error(t('patientHistory.toast.imagesSyncFailed'));
                        }

                        await refreshHistory(refreshedTreatment);
                        setMediaSyncingTreatmentIds((current) => current.filter((id) => id !== treatmentId));
                    }
                })();
            }

            return {
                treatment,
                hasBackgroundMediaSync: removeImageIds.length > 0 || imageFiles.length > 0,
            };
        },
        onSuccess: ({ treatment, hasBackgroundMediaSync }) => {
            toast.success(editingTreatment ? t('patientHistory.toast.updated') : t('patientHistory.toast.created'));
            if (hasBackgroundMediaSync) {
                setMediaSyncingTreatmentIds((current) => (
                    current.includes(treatment.id) ? current : [...current, treatment.id]
                ));
            }
            rememberPatientListFocus(patientId, { currentPage: 1 });
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            setIsDialogOpen(false);
            setEditingTreatment(null);
            setFormState(createEmptyFormState());
            invalidateHistory();
        },
        onError: (error) => {
            invalidateHistory();
            toast.error(getApiErrorMessage(error, editingTreatment ? t('patientHistory.toast.updateFailed') : t('patientHistory.toast.createFailed')));
        },
    });

    const deleteTreatmentMutation = useMutation({
        mutationFn: (treatmentId: string) => deletePatientTreatment(patientId, treatmentId),
        onMutate: async (treatmentId: string) => {
            await queryClient.cancelQueries({ queryKey: treatmentsQueryKey });
            const previousHistory = queryClient.getQueryData<TreatmentHistoryPages>(treatmentsQueryKey);

            queryClient.setQueryData<TreatmentHistoryPages>(
                treatmentsQueryKey,
                (current) => current
                    ? {
                        ...current,
                        pages: current.pages.map((page) => ({
                            ...page,
                            data: page.data.filter((treatment) => treatment.id !== treatmentId),
                        })),
                    }
                    : current
            );

            setTreatmentToDelete(null);

            return { previousHistory };
        },
        onSuccess: () => {
            toast.success(t('patientHistory.toast.deleted'));
            rememberPatientListFocus(patientId, { currentPage: 1 });
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            invalidateHistory();
        },
        onError: (error, _treatmentId, context) => {
            if (context?.previousHistory) {
                queryClient.setQueryData(
                    treatmentsQueryKey,
                    context.previousHistory
                );
            }

            toast.error(getApiErrorMessage(error, t('patientHistory.toast.deleteFailed')));
        },
        onSettled: () => {
            invalidateHistory();
        },
    });

    const treatmentTypeError = submitAttempted && formState.treatmentType.trim().length < 2 ? t('patientHistory.validation.workDone') : '';
    const dateError = submitAttempted && !formState.treatmentDate ? t('patientHistory.validation.date') : '';
    const amountError =
        submitAttempted && [formState.debtAmount, formState.paidAmount].some((value) => parseAmountInput(value, formState.currency) < 0)
            ? t('patientHistory.validation.amount')
            : '';
    const imageValidationError =
        submitAttempted
            ? formState.imageFiles
                .map((file) => validateHistoryImageFile(file, t, maxHistoryUploadBytes, maxHistoryUploadMb))
                .find(Boolean) ?? ''
            : '';
    const visibleExistingImagesCount = editingTreatment
        ? getVisibleTreatmentImages(editingTreatment, formState.removeImageIds).length
        : 0;
    const isEditingImagePanelLoading = Boolean(
        editingTreatment
        && detailLoadingTreatmentId === editingTreatment.id
        && !hasCompleteTreatmentImages(editingTreatment)
    );
    const maxImagesError =
        submitAttempted && visibleExistingImagesCount + formState.imageFiles.length > maxHistoryImagesPerEntry
            ? t('patientHistory.validation.maxImages', { max: maxHistoryImagesPerEntry })
            : '';
    const handleAmountInputFocus = (field: 'debtAmount' | 'paidAmount') => (event: FocusEvent<HTMLInputElement>) => {
        const input = event.currentTarget;

        if (input.value.length === 0) {
            setFormState((current) => ({ ...current, [field]: '0' }));
        }

        moveTextInputCaretToEnd(input);
    };

    const selectedImagePreviews = useMemo(
        () =>
            formState.imageFiles.map((file, index) => ({
                id: `${file.name}-${file.lastModified}-${index}`,
                file,
                url: URL.createObjectURL(file),
            })),
        [formState.imageFiles]
    );
    const selectedPreviewGalleryImages = useMemo<PreviewGalleryImage[]>(
        () =>
            selectedImagePreviews.map((item, imageIndex) => ({
                id: item.id,
                src: item.url,
                thumbnailSrc: item.url,
                alt: `${historyImageLabel} ${imageIndex + 1}`,
                title: `${historyImageLabel} ${imageIndex + 1}`,
            })),
        [historyImageLabel, selectedImagePreviews]
    );

    useEffect(() => {
        return () => {
            selectedImagePreviews.forEach((preview) => {
                URL.revokeObjectURL(preview.url);
            });
        };
    }, [selectedImagePreviews]);
    useEffect(() => {
        setPreviewGallery((current) => {
            if (!current || current.treatmentId) {
                return current;
            }

            if (selectedPreviewGalleryImages.length === 0) {
                return null;
            }

            return {
                ...current,
                images: selectedPreviewGalleryImages,
                startIndex: Math.min(current.startIndex, selectedPreviewGalleryImages.length - 1),
                treatmentDate: formState.treatmentDate,
            };
        });
    }, [formState.treatmentDate, selectedPreviewGalleryImages]);

    const canManageHistory = canManage(currentUserQuery.data, 'patients');
    // Read-only financial display is gated by payments.view. A
    // view-only-patients assistant sees locked placeholders in the summary
    // and compact finance chips, so hidden money fields are explicit.
    // The edit dialog stays gated by canManageHistory (patients.manage)
    // because creating a treatment inherently involves setting its price.
    const canViewFinancials = canView(currentUserQuery.data, 'payments');
    const manageDeniedMessage = getManageDeniedMessage(currentUserQuery.data, t);
    // AF5: subscription-read-only is the one branch where we keep a
    // disabled affordance (with a toast on click) so the dentist owner
    // sees the action exists but is paused. View-only assistants get
    // no affordance at all — `historyManageDisplayMode` decides which.
    const historyManageDisplayMode: 'enabled' | 'disabled-readonly' | 'hidden' =
        canManageHistory
            ? 'enabled'
            : isSubscriptionReadOnly(currentUserQuery.data)
                ? 'disabled-readonly'
                : 'hidden';

    const saveEditedTreatmentImageMutation = useMutation({
        mutationFn: async ({
            treatmentId,
            imageId,
            file,
        }: {
            treatmentId: string;
            imageId: string;
            file: File;
        }) => {
            if (!canManageHistory) {
                throw new Error(manageDeniedMessage);
            }

            const [optimizedFile] = await optimizeImageFilesForUpload([file], {
                concurrency: 1,
                targetMaxBytes: maxHistoryUploadBytes,
            });

            if (!optimizedFile || optimizedFile.size > maxHistoryUploadBytes) {
                throw new Error(t('patientHistory.validation.imageSize', { sizeMb: maxHistoryUploadMb }));
            }

            const updatedTreatment = await replacePatientTreatmentImage(patientId, treatmentId, imageId, optimizedFile);

            return waitForTreatmentMediaReady(treatmentId, Math.max(getTreatmentImageCount(updatedTreatment), 1));
        },
        onMutate: ({ treatmentId }) => {
            setMediaSyncingTreatmentIds((current) => (
                current.includes(treatmentId) ? current : [...current, treatmentId]
            ));
        },
        onSuccess: (updatedTreatment, variables) => {
            mergeTreatmentIntoCaches(updatedTreatment);

            const images = getPreviewableTreatmentImages(updatedTreatment);
            setPreviewGallery((current) => {
                if (!current || current.treatmentId !== updatedTreatment.id || images.length === 0) {
                    return current;
                }

                const treatmentDate = updatedTreatment.treatment_date ?? current.treatmentDate;

                return {
                    ...current,
                    images: buildPreviewGalleryImages(
                        images,
                        patientName,
                        t('patientHistory.image'),
                        treatmentDate
                    ),
                    startIndex: Math.max(images.findIndex((image) => image.id === variables.imageId), 0),
                    treatmentDate,
                };
            });
            toast.success(t('patientHistory.toast.imageEdited'));
            invalidateHistory();
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patientHistory.toast.imagesSyncFailed')));
        },
        onSettled: (_data, _error, variables) => {
            setMediaSyncingTreatmentIds((current) => (
                current.filter((id) => id !== variables?.treatmentId)
            ));
        },
    });

    const handleSubmit = () => {
        setSubmitAttempted(true);
        if (!canManageHistory) {
            toast.error(manageDeniedMessage);
            return;
        }

        if (isPreparingImages || treatmentTypeError || dateError || amountError || imageValidationError || maxImagesError) {
            toast.error(t('patientHistory.validation.fixErrors'));
            return;
        }

        saveTreatmentMutation.mutate();
    };

    const handleDialogOpenChange = (open: boolean) => {
        setIsDialogOpen(open);
        if (!open) {
            setEditingTreatment(null);
            setFormState(createEmptyFormState());
            setSubmitAttempted(false);
        }
    };

    const openCreateDialog = () => {
        if (!canManageHistory) {
            toast.error(manageDeniedMessage);
            return;
        }
        if (isDialogOpen && editingTreatment === null) {
            return;
        }

        setEditingTreatment(null);
        setFormState(createEmptyFormState());
        setSubmitAttempted(false);
        setIsDialogOpen(true);
    };

    const openEditDialog = async (treatment: ApiTreatment) => {
        if (!canManageHistory) {
            toast.error(manageDeniedMessage);
            return;
        }

        setEditingTreatment(treatment);
        setFormState(createTreatmentFormState(treatment));
        setSubmitAttempted(false);
        setIsDialogOpen(true);

        if (hasCompleteTreatmentImages(treatment)) {
            return;
        }

        setDetailLoadingTreatmentId(treatment.id);

        try {
            const detailedTreatment = await loadTreatmentDetail(treatment);
            setEditingTreatment(detailedTreatment);
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('patientHistory.error.loadFailed')));
        } finally {
            setDetailLoadingTreatmentId((current) => (current === treatment.id ? null : current));
        }
    };

    const handleImageFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (selectedFiles.length === 0) {
            return;
        }
        if (!canManageHistory) {
            toast.error(manageDeniedMessage);
            return;
        }

        const existingCount = editingTreatment
            ? getVisibleTreatmentImages(editingTreatment, formState.removeImageIds).length
            : 0;
        const availableSlots = Math.max(
            maxHistoryImagesPerEntry - existingCount - formState.imageFiles.length,
            0
        );
        const filesToAdd = selectedFiles.slice(0, availableSlots);

        if (filesToAdd.length === 0) {
            toast.error(t('patientHistory.validation.maxImages', { max: maxHistoryImagesPerEntry }));
            return;
        }

        if (filesToAdd.length < selectedFiles.length) {
            toast.error(t('patientHistory.validation.maxImages', { max: maxHistoryImagesPerEntry }));
        }

        const oversizedOriginal = filesToAdd.find((file) => file.size > maxHistoryUploadBytes);
        if (oversizedOriginal) {
            toast.error(t('patientHistory.validation.imageSize', { sizeMb: maxHistoryUploadMb }));
            return;
        }

        setIsPreparingImages(true);

        try {
            // Client-side optimization is a bandwidth optimization only — the backend
            // image pipeline auto-compresses with smart quality-preserving heuristics.
            // We don't post-filter by stored cap because the backend no longer enforces
            // a per-file stored limit (only upload_max_mb is enforced on ingest).
            const optimizedFiles = await optimizeImageFilesForUpload(filesToAdd, {
                concurrency: 4,
                targetMaxBytes: null,
            });

            setFormState((current) => ({
                ...current,
                imageFiles: [...current.imageFiles, ...optimizedFiles],
            }));
        } finally {
            setIsPreparingImages(false);
        }
    };

    const removeSelectedImage = (index: number) => {
        if (!canManageHistory) {
            toast.error(manageDeniedMessage);
            return;
        }

        setFormState((current) => ({
            ...current,
            imageFiles: current.imageFiles.filter((_, imageIndex) => imageIndex !== index),
        }));
    };

    const toggleExistingImageRemoval = (imageId: string) => {
        if (!canManageHistory) {
            toast.error(manageDeniedMessage);
            return;
        }

        setFormState((current) => ({
            ...current,
            removeImageIds: current.removeImageIds.includes(imageId)
                ? current.removeImageIds.filter((value) => value !== imageId)
                : [...current.removeImageIds, imageId],
        }));
    };

    const openTreatmentImageGallery = async (
        treatment: ApiTreatment,
        startIndex = 0
    ) => {
        const fallbackDate = treatment.treatment_date;
        const openGallery = (galleryTreatment: ApiTreatment) => {
            const images = getPreviewableTreatmentImages(galleryTreatment);

            if (images.length === 0) {
                return;
            }

            setPreviewGallery({
                images: buildPreviewGalleryImages(
                    images,
                    patientName,
                    t('patientHistory.image'),
                    galleryTreatment.treatment_date ?? fallbackDate
                ),
                startIndex: Math.min(startIndex, images.length - 1),
                fallbackTitle: patientName,
                treatmentId: galleryTreatment.id,
                treatmentDate: galleryTreatment.treatment_date ?? fallbackDate,
            });
        };

        if (hasCompleteTreatmentImages(treatment)) {
            openGallery(treatment);
            return;
        }

        setDetailLoadingTreatmentId(treatment.id);

        try {
            const detailedTreatment = await loadTreatmentDetail(treatment);
            const images = (detailedTreatment.images ?? []).filter((image) => getTreatmentImagePreviewUrl(image));

            if (!images || images.length === 0) {
                return;
            }

            openGallery({
                ...detailedTreatment,
                images,
            });
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('patientHistory.error.loadFailed')));
        } finally {
            setDetailLoadingTreatmentId((current) => (current === treatment.id ? null : current));
        }
    };

    const isLoading = treatmentsQuery.isLoading;
    const isError = treatmentsQuery.isError;
    const isInlineCreateOpen = isDialogOpen && editingTreatment === null;
    const renderSelectedPreviewGallery = (startIndex: number) => {
        setPreviewGallery({
            images: selectedPreviewGalleryImages,
            startIndex,
            fallbackTitle: patientName,
            treatmentId: '',
            treatmentDate: formState.treatmentDate,
        });
    };

    const saveEditedPendingTreatmentImage = async (image: PreviewGalleryImage, file: File) => {
        const previewIndex = selectedImagePreviews.findIndex((preview) => preview.id === image.id);

        if (previewIndex < 0) {
            throw new Error(t('gallery.edit.failed'));
        }

        setIsSavingPendingImageEdit(true);

        try {
            const [optimizedFile] = await optimizeImageFilesForUpload([file], {
                concurrency: 1,
                targetMaxBytes: null,
            });

            if (!optimizedFile) {
                throw new Error(t('gallery.edit.failed'));
            }

            const validationError = validateHistoryImageFile(optimizedFile, t, maxHistoryUploadBytes, maxHistoryUploadMb);

            if (validationError) {
                throw new Error(validationError);
            }

            setFormState((current) => {
                if (previewIndex >= current.imageFiles.length) {
                    return current;
                }

                const imageFiles = [...current.imageFiles];
                imageFiles[previewIndex] = optimizedFile;

                return {
                    ...current,
                    imageFiles,
                };
            });
            toast.success(t('patientHistory.toast.imageEdited'));
        } finally {
            setIsSavingPendingImageEdit(false);
        }
    };

    const renderTreatmentFormCard = (mode: 'create' | 'edit') => {
        const existingImages = editingTreatment?.images ?? [];
        const hasImages = existingImages.length > 0 || selectedImagePreviews.length > 0;
        const formDate = formState.treatmentDate || toLocalDateKey(new Date());
        const formModeLabel = mode === 'edit' ? t('patientHistory.formMode.edit') : t('patientHistory.formMode.create');

        return (
            <article key={mode === 'edit' ? `edit-${editingTreatment?.id ?? 'entry'}` : 'new-entry'} className="relative grid gap-2 md:grid-cols-[96px_minmax(0,1fr)]">
                <div className="hidden grid-cols-[1fr_24px] items-start gap-2 pt-5 md:grid">
                    <TimelineDate date={formDate} />
                    <span className="relative z-10 mt-0.5 h-3.5 w-3.5 justify-self-center rounded-full border-2 border-white bg-teal-500 shadow-sm ring-4 ring-teal-50" />
                </div>
                <div className="rounded-2xl border border-teal-200 bg-white p-3 shadow-sm ring-1 ring-teal-100/80">
                    <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-600">
                                    {formModeLabel}
                                </span>
                                <span className="hidden h-4 w-px bg-slate-200 sm:inline-block" aria-hidden="true" />
                                <Label htmlFor="historyDate" className="sr-only">
                                    {t('patientHistory.table.date')}
                                </Label>
                                <Input
                                    id="historyDate"
                                    type="date"
                                    required
                                    max={toLocalDateKey(new Date())}
                                    value={formState.treatmentDate}
                                    onChange={(event) => setFormState((current) => ({ ...current, treatmentDate: event.target.value }))}
                                    className="h-8 w-40 rounded-xl border-slate-200 px-3 text-xs font-semibold tabular-nums text-slate-600 shadow-sm"
                                />
                            </div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="h-8 w-8 shrink-0 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                aria-label={t('common.cancel')}
                                onClick={() => handleDialogOpenChange(false)}
                                disabled={saveTreatmentMutation.isPending || isPreparingImages}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="space-y-2">
                            {dateError ? <p className="text-xs text-red-600">{dateError}</p> : null}
                            <Label htmlFor="historyWorkDone" className="sr-only">
                                {t('patientHistory.table.workDone')}
                            </Label>
                            <Input
                                id="historyWorkDone"
                                required
                                value={formState.treatmentType}
                                onChange={(event) => setFormState((current) => ({ ...current, treatmentType: event.target.value }))}
                                placeholder={t('patientHistory.workDonePlaceholder')}
                                className="h-11 rounded-xl border-slate-200 bg-white px-4 text-sm font-semibold text-slate-950 shadow-sm transition-colors placeholder:text-slate-400 focus-visible:border-teal-300 focus-visible:ring-2 focus-visible:ring-teal-100 sm:text-base"
                            />
                            <div className="flex flex-wrap gap-1.5" aria-label="Work type suggestions">
                                {HISTORY_WORK_DONE_SUGGESTION_KEYS.map((suggestionKey) => {
                                    const suggestion = t(suggestionKey);
                                    const isSelected = formState.treatmentType.trim() === suggestion;

                                    return (
                                        <Button
                                            key={suggestionKey}
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            aria-pressed={isSelected}
                                            className={`h-7 rounded-full px-2.5 text-xs font-semibold shadow-none ${
                                                isSelected
                                                    ? 'border-teal-300 bg-teal-50 text-teal-700'
                                                    : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50/70 hover:text-teal-700'
                                            }`}
                                            onClick={() => setFormState((current) => ({ ...current, treatmentType: suggestion }))}
                                        >
                                            {suggestion}
                                        </Button>
                                    );
                                })}
                            </div>
                            {treatmentTypeError ? <p className="text-xs text-red-600">{treatmentTypeError}</p> : null}
                        </div>
                    </div>

                    <div className="mt-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                {t('patientHistory.images')} · {visibleExistingImagesCount + selectedImagePreviews.length} / {maxHistoryImagesPerEntry}
                            </p>
                        </div>
                        <Input
                            id="historyImages"
                            type="file"
                            multiple
                            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                            onChange={handleImageFilesSelected}
                            disabled={!canManageHistory || isPreparingImages}
                            className="sr-only"
                        />
                        <div
                            className="grid gap-2"
                            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(8rem, 8rem))' }}
                        >
                            {isEditingImagePanelLoading ? (
                                Array.from({ length: Math.min(editingTreatment ? getTreatmentImageCount(editingTreatment) : 0, 4) }).map((_, index) => (
                                    <Skeleton key={`image-loading-${index}`} className="h-24 rounded-xl lg:h-28" />
                                ))
                            ) : (
                                existingImages.map((image, index) => {
                                    const thumbnailUrl = getTreatmentImageThumbnailUrl(image);
                                    const previewUrl = getTreatmentImagePreviewUrl(image);
                                    const isMarkedForRemoval = formState.removeImageIds.includes(image.id);
                                    const imageLabel = `${t('patientHistory.image')} ${index + 1}`;

                                    return (
                                        <div
                                            key={image.id}
                                            className={`group relative h-24 overflow-hidden rounded-xl border bg-slate-100 shadow-sm transition-all lg:h-28 ${
                                                isMarkedForRemoval
                                                    ? 'border-red-200 opacity-70 ring-1 ring-red-100'
                                                    : 'border-slate-200 hover:border-teal-300 hover:shadow-md'
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 disabled:cursor-wait"
                                                onClick={() => {
                                                    const previewableImages = existingImages.filter((existingImage) => getTreatmentImagePreviewUrl(existingImage));
                                                    const previewIndex = Math.max(previewableImages.findIndex((existingImage) => existingImage.id === image.id), 0);

                                                    setPreviewGallery({
                                                        images: previewableImages.map((existingImage, imageIndex) => ({
                                                            id: existingImage.id,
                                                            src: getTreatmentImagePreviewUrl(existingImage) ?? '',
                                                            thumbnailSrc: getTreatmentImageThumbnailUrl(existingImage) ?? undefined,
                                                            alt: `${patientName} ${t('patientHistory.image')} ${imageIndex + 1}`,
                                                            title: `${t('patientHistory.image')} ${imageIndex + 1} - ${formatDate(formDate)}`,
                                                        })),
                                                        startIndex: previewIndex,
                                                        fallbackTitle: patientName,
                                                        treatmentId: editingTreatment?.id ?? '',
                                                        treatmentDate: formDate,
                                                    });
                                                }}
                                                disabled={!previewUrl}
                                                aria-label={imageLabel}
                                                title={previewUrl ? imageLabel : t('patientHistory.imageProcessing')}
                                            >
                                                {thumbnailUrl ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={thumbnailUrl}
                                                        alt={imageLabel}
                                                        crossOrigin={getProtectedMediaCrossOrigin(thumbnailUrl)}
                                                        className={`h-full w-full object-cover transition-transform group-hover:scale-[1.03] ${isMarkedForRemoval ? 'grayscale' : ''}`}
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <span className="inline-flex h-full w-full items-center justify-center bg-slate-50 text-slate-400">
                                                        <Loader2 className="h-4 w-4 animate-spin opacity-70" />
                                                    </span>
                                                )}
                                            </button>
                                            <span className="absolute left-1.5 top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-900/75 px-1.5 text-[10px] font-bold text-white">
                                                {index + 1}
                                            </span>
                                            <button
                                                type="button"
                                                className={`absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border text-[10px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                                                    isMarkedForRemoval
                                                        ? 'border-teal-200 bg-white text-teal-700 hover:bg-teal-50'
                                                        : 'border-white/80 bg-red-600 text-white hover:bg-red-700'
                                                }`}
                                                onClick={() => toggleExistingImageRemoval(image.id)}
                                                aria-label={isMarkedForRemoval ? t('patients.restore') : t('patientHistory.removeImage')}
                                                title={isMarkedForRemoval ? t('patients.restore') : t('patientHistory.removeImage')}
                                            >
                                                {isMarkedForRemoval ? <RotateCcw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                            {selectedImagePreviews.map((preview, index) => (
                                <div key={preview.id} className="group relative h-24 overflow-hidden rounded-xl border border-teal-200 bg-slate-100 shadow-sm transition-all hover:border-teal-300 hover:shadow-md lg:h-28">
                                    <button
                                        type="button"
                                        className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1"
                                        onClick={() => renderSelectedPreviewGallery(index)}
                                        aria-label={`${t('patientHistory.image')} ${existingImages.length + index + 1}`}
                                        title={`${t('patientHistory.image')} ${existingImages.length + index + 1}`}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={preview.url} alt={`${t('patientHistory.image')} ${existingImages.length + index + 1}`} className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" loading="lazy" />
                                    </button>
                                    <span className="absolute left-1.5 top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-teal-700/85 px-1.5 text-[10px] font-bold text-white">
                                        {existingImages.length + index + 1}
                                    </span>
                                    <button
                                        type="button"
                                        className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-red-600 text-white shadow-sm transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                                        onClick={() => removeSelectedImage(index)}
                                        aria-label={t('patientHistory.removeImage')}
                                        title={t('patientHistory.removeImage')}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        className="absolute bottom-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/95 text-slate-700 opacity-0 shadow-sm transition-all hover:bg-teal-50 hover:text-teal-700 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 group-hover:opacity-100"
                                        onClick={() => renderSelectedPreviewGallery(index)}
                                        aria-label={`${t('common.edit')} ${t('patientHistory.image')} ${existingImages.length + index + 1}`}
                                        title={`${t('common.edit')} ${t('patientHistory.image')} ${existingImages.length + index + 1}`}
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                            {visibleExistingImagesCount + selectedImagePreviews.length < maxHistoryImagesPerEntry ? (
                                <Label
                                    htmlFor={!canManageHistory || isPreparingImages ? undefined : 'historyImages'}
                                    className={`group inline-flex h-24 min-h-24 items-center justify-center rounded-xl border border-dashed border-teal-200 bg-teal-50/60 px-2 text-teal-700 transition-all lg:h-28 ${!canManageHistory || isPreparingImages ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-teal-300 hover:bg-teal-50 hover:shadow-sm'}`}
                                    onClick={() => {
                                        if (!canManageHistory) {
                                            toast.error(manageDeniedMessage);
                                        }
                                    }}
                                    aria-label={t('odontogram.image.upload')}
                                    title={t('odontogram.image.upload')}
                                >
                                    {isPreparingImages ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <span className="flex flex-col items-center gap-1 text-center">
                                            <Plus className="h-5 w-5 transition-transform group-hover:scale-110" />
                                            <span className="max-h-12 overflow-hidden text-[10px] font-medium leading-tight text-teal-700/70">
                                                {t('patientHistory.imagesHint', { max: maxHistoryImagesPerEntry, sizeMb: maxHistoryUploadMb })}
                                            </span>
                                        </span>
                                    )}
                                </Label>
                            ) : null}
                            {!hasImages && visibleExistingImagesCount + selectedImagePreviews.length >= maxHistoryImagesPerEntry ? (
                                <span className="inline-flex h-10 items-center rounded-full border border-dashed border-slate-200 bg-white px-3 text-xs text-slate-400">
                                    {t('patientHistory.imagesEmpty')}
                                </span>
                            ) : null}
                        </div>
                        {imageValidationError ? <p className="mt-2 text-xs text-red-600">{imageValidationError}</p> : null}
                        {maxImagesError ? <p className="mt-2 text-xs text-red-600">{maxImagesError}</p> : null}
                    </div>

                    <div className="mt-2">
                        <Label htmlFor="historyComment" className="sr-only">{t('patientHistory.commentLabel')}</Label>
                        <Textarea
                            id="historyComment"
                            rows={2}
                            maxLength={5000}
                            value={formState.comment}
                            onChange={(event) => setFormState((current) => ({ ...current, comment: event.target.value }))}
                            placeholder={t('patientHistory.commentPlaceholder')}
                            className="min-h-14 resize-y rounded-xl border-slate-200 bg-white text-sm shadow-sm"
                        />
                    </div>

                    {canViewFinancials ? (
                        <>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                    {t('payments.table.balance')}
                                </span>
                                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-xs">
                                    {TREATMENT_CURRENCIES.map((currency) => (
                                        <button
                                            key={currency}
                                            type="button"
                                            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                                                formState.currency === currency
                                                    ? 'bg-teal-50 text-teal-700 shadow-xs ring-1 ring-teal-200'
                                                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                                            }`}
                                            onClick={() => setFormState((current) => ({
                                                ...current,
                                                currency,
                                                debtAmount: reformatTreatmentAmountForCurrency(current.debtAmount, current.currency, currency),
                                                paidAmount: reformatTreatmentAmountForCurrency(current.paidAmount, current.currency, currency),
                                            }))}
                                        >
                                            {currency}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5">
                                    <Label htmlFor="historyDebt" className="block truncate text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                                        {t('patientHistory.table.debt')}
                                    </Label>
                                    <Input
                                        id="historyDebt"
                                        type="text"
                                        inputMode={formState.currency === 'USD' ? 'decimal' : 'numeric'}
                                        value={formState.debtAmount}
                                        onChange={(event) => setFormState((current) => ({ ...current, debtAmount: formatAmountInput(event.target.value, current.currency) }))}
                                        onFocus={handleAmountInputFocus('debtAmount')}
                                        placeholder="0"
                                        className="mt-0.5 h-7 border-0 bg-transparent px-0 text-xs font-bold tabular-nums text-red-700 shadow-none focus-visible:ring-0"
                                    />
                                </div>
                                <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5">
                                    <Label htmlFor="historyPaid" className="block truncate text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                                        {t('patientHistory.table.paid')}
                                    </Label>
                                    <Input
                                        id="historyPaid"
                                        type="text"
                                        inputMode={formState.currency === 'USD' ? 'decimal' : 'numeric'}
                                        value={formState.paidAmount}
                                        onChange={(event) => setFormState((current) => ({ ...current, paidAmount: formatAmountInput(event.target.value, current.currency) }))}
                                        onFocus={handleAmountInputFocus('paidAmount')}
                                        placeholder="0"
                                        className="mt-0.5 h-7 border-0 bg-transparent px-0 text-xs font-bold tabular-nums text-green-700 shadow-none focus-visible:ring-0"
                                    />
                                </div>
                            </div>
                            {amountError ? <p className="mt-2 text-xs text-red-600">{amountError}</p> : null}
                        </>
                    ) : null}

                    <div className="mt-3 flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:justify-end">
                        <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)} disabled={saveTreatmentMutation.isPending || isPreparingImages}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="button" onClick={handleSubmit} disabled={saveTreatmentMutation.isPending || isPreparingImages || !canManageHistory}>
                            {saveTreatmentMutation.isPending ? t('common.saving') : isPreparingImages ? t('common.loading') : t('common.saveChanges')}
                        </Button>
                    </div>
                </div>
            </article>
        );
    };

    const renderFinancialSummaryStrip = () => (
        <div
            data-testid="patient-history-financial-summary"
            className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 xl:w-[30rem] 2xl:w-[32rem]"
        >
            <HistoryFinancialPill
                label={t('patientHistory.totalDebt')}
                value={formatMoneyBreakdown(summary.totalsByCurrency, 'totalDebt')}
                tone="red"
                locked={!canViewFinancials}
            />
            <HistoryFinancialPill
                label={t('patientHistory.totalPaid')}
                value={formatMoneyBreakdown(summary.totalsByCurrency, 'totalPaid')}
                tone="emerald"
                locked={!canViewFinancials}
            />
            <HistoryFinancialPill
                label={t('patientHistory.netBalance')}
                value={hasMixedNetBalanceStatus
                    ? renderMoneyBreakdownWithBalanceStatuses(summary.totalsByCurrency, t)
                    : formatMoneyBreakdown(summary.totalsByCurrency, 'netBalance')}
                tone={netBalanceTone}
                badge={!hasMixedNetBalanceStatus && netBalanceStatusKey ? t(netBalanceStatusKey) : null}
                locked={!canViewFinancials}
            />
        </div>
    );

    return (
        <>
            <Card className="interactive-card rounded-2xl border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3">
                    <div
                        data-testid="patient-history-header"
                        className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(12rem,1fr)_minmax(0,32rem)_auto] xl:items-center"
                    >
                        <div className="min-w-0">
                            <CardTitle className="truncate">{t('patientHistory.title')}</CardTitle>
                        </div>
                        <div className="min-w-0 xl:justify-self-center">
                            {renderFinancialSummaryStrip()}
                        </div>
                        <div
                            data-testid="patient-history-actions"
                            className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center xl:justify-self-end"
                        >
                            {subscription?.can_export ? (
                                <Button
                                    variant="outline"
                                    onClick={async () => {
                                    // PDF payload mirrors the on-screen gating: viewers
                                    // without `payments.view` get a slimmer PDF with
                                    // clinical columns only. Without this, an
                                    // assistant whose UI hides debt/paid/remaining
                                    // could still print them via the export button
                                    // (gated only by can_export at the subscription
                                    // level). Keep clinical context (date/teeth/work).
                                    try {
                                        const exportTreatments = await listAllPatientTreatments(patientId, {
                                            sort: HISTORY_SORT,
                                            includeImages: false,
                                        });
                                        const treatmentRows = exportTreatments.map((tr) => canViewFinancials
                                            ? (() => {
                                                const currency = coerceTreatmentCurrency(tr.currency);
                                                const debt = Number(tr.debt_amount ?? 0);
                                                const paid = Number(tr.paid_amount ?? 0);
                                                const balance = Number(tr.balance ?? 0);
                                                const balanceValue = formatCurrency(Math.abs(balance), currency);
                                                const balanceStatus = shouldShowBalanceStatus(debt, paid, balance)
                                                    ? ` (${t(getBalanceStatusKey(balance))})`
                                                    : '';

                                                return [
                                                    formatDate(tr.treatment_date),
                                                    formatTeeth(tr.teeth ?? []) || '-',
                                                    tr.treatment_type,
                                                    formatCurrency(debt, currency),
                                                    formatCurrency(paid, currency),
                                                    `${balanceValue}${balanceStatus}`,
                                                ];
                                            })()
                                            : [
                                                formatDate(tr.treatment_date),
                                                formatTeeth(tr.teeth ?? []) || '-',
                                                tr.treatment_type,
                                            ]);
                                        exportPatientReportToPdf({
                                            filename: buildPdfFilename(`patient-${patientName.replace(/\s+/g, '-').toLowerCase()}`),
                                            title: t('patientHistory.title'),
                                            locale,
                                            patientName,
                                            patientMeta: [
                                                t('patientDetail.totalAppointments') + ': ' + exportTreatments.length,
                                                formatLocalizedDate(new Date(), locale, { year: 'numeric', month: 'short', day: 'numeric' }),
                                            ],
                                            summary: canViewFinancials
                                                ? [
                                                    { label: t('patientHistory.totalDebt'), value: formatMoneyBreakdown(summary.totalsByCurrency, 'totalDebt'), tone: 'red' },
                                                    { label: t('patientHistory.totalPaid'), value: formatMoneyBreakdown(summary.totalsByCurrency, 'totalPaid'), tone: 'green' },
                                                    {
                                                        label: netBalanceStatusKey
                                                            ? `${t('patientHistory.netBalance')} · ${t(netBalanceStatusKey)}`
                                                            : t('patientHistory.netBalance'),
                                                        value: formatMoneyBreakdown(summary.totalsByCurrency, 'netBalance'),
                                                        tone: netBalanceTone === 'blue' ? 'blue' : netBalanceTone === 'slate' ? 'neutral' : 'yellow',
                                                    },
                                                ]
                                                : [],
                                            sections: [
                                                {
                                                    title: t('patientHistory.title'),
                                                    table: {
                                                        columns: canViewFinancials
                                                            ? [
                                                                t('patientHistory.table.date'),
                                                                t('patientHistory.teethLabel'),
                                                                t('patientHistory.table.workDone'),
                                                                t('patientHistory.table.debt'),
                                                                t('patientHistory.table.paid'),
                                                                t('patientHistory.table.remaining'),
                                                            ]
                                                            : [
                                                                t('patientHistory.table.date'),
                                                                t('patientHistory.teethLabel'),
                                                                t('patientHistory.table.workDone'),
                                                            ],
                                                        rows: treatmentRows,
                                                        emptyText: t('patientHistory.empty'),
                                                    },
                                                },
                                            ],
                                            orientation: 'portrait',
                                        });
                                        toast.success(t('export.downloaded'));
                                    } catch (error) {
                                        toast.error(getApiErrorMessage(error, t('patientHistory.error.loadFailed')));
                                    }
                                    }}
                                >
                                    <Download className="h-4 w-4" />
                                    {t('common.export')}
                                </Button>
                            ) : null}
                            {historyManageDisplayMode === 'enabled' ? (
                                <Button onClick={openCreateDialog} variant={isInlineCreateOpen ? 'secondary' : 'default'}>
                                    <Plus className="h-4 w-4" />
                                    {t('patientHistory.addEntry')}
                                </Button>
                            ) : historyManageDisplayMode === 'disabled-readonly' ? (
                                <Button disabled onClick={() => toast.error(manageDeniedMessage)}>
                                    <Plus className="h-4 w-4" />
                                    {t('patientHistory.addEntry')}
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {isLoading ? (
                        <div className="relative space-y-3">
                            <div className="absolute bottom-3 left-[84px] top-3 hidden w-px bg-slate-200 md:block" aria-hidden="true" />
                            {Array.from({ length: 3 }).map((_, index) => (
                                <div key={index} className="relative grid gap-2 md:grid-cols-[96px_minmax(0,1fr)]">
                                    <div className="hidden grid-cols-[1fr_24px] items-start gap-2 pt-5 md:grid">
                                        <Skeleton className="mt-0.5 h-8 w-14 justify-self-end" />
                                        <span className="relative z-10 h-3.5 w-3.5 justify-self-center rounded-full border-2 border-white bg-slate-200 shadow-sm" />
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                        <div className="mb-3 flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1 space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Skeleton className="h-6 w-28 rounded-full md:hidden" />
                                                    <Skeleton className="h-6 w-20 rounded-full" />
                                                </div>
                                                <Skeleton className="h-5 w-52" />
                                            </div>
                                            <Skeleton className="h-8 w-16 rounded-lg" />
                                        </div>
                                        <div className="mb-3 flex gap-2 overflow-hidden">
                                            {Array.from({ length: 4 }).map((__, imageIndex) => (
                                                <Skeleton key={imageIndex} className="h-24 w-40 shrink-0 rounded-xl lg:h-28 lg:w-48" />
                                            ))}
                                        </div>
                                        <Skeleton className="mb-3 h-4 w-full max-w-lg" />
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                            <Skeleton className="h-11 rounded-lg" />
                                            <Skeleton className="h-11 rounded-lg" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : isError ? (
                        <div className="space-y-4 rounded-xl border border-red-100 bg-red-50 px-4 py-4">
                            <p className="text-sm text-red-600">{getApiErrorMessage(treatmentsQuery.error, t('patientHistory.error.loadFailed'))}</p>
                            <Button variant="outline" onClick={() => treatmentsQuery.refetch()}>{t('common.retry')}</Button>
                        </div>
                    ) : treatments.length === 0 && !isInlineCreateOpen ? (
                        <div className="rounded-2xl border border-dashed border-slate-200">
                            <EmptyState
                                icon={CalendarDays}
                                title={t('patientHistory.empty')}
                                action={historyManageDisplayMode === 'enabled' ? (
                                    <Button variant="outline" onClick={openCreateDialog}>
                                        <Plus className="h-4 w-4 mr-1.5" />
                                        {t('patientHistory.addFirstEntry')}
                                    </Button>
                                ) : historyManageDisplayMode === 'disabled-readonly' ? (
                                    <Button variant="outline" disabled onClick={() => toast.error(manageDeniedMessage)}>
                                        <Plus className="h-4 w-4 mr-1.5" />
                                        {t('patientHistory.addFirstEntry')}
                                    </Button>
                                ) : undefined}
                            />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="relative space-y-3">
                                <div className="absolute bottom-3 left-[84px] top-3 hidden w-px bg-slate-200 md:block" aria-hidden="true" />
                                {isInlineCreateOpen ? renderTreatmentFormCard('create') : null}
                                {treatments.map((treatment) => {
                                const imageCount = getTreatmentImageCount(treatment);
                                const treatmentCurrency = coerceTreatmentCurrency(treatment.currency);
                                const debtAmount = Number(treatment.debt_amount);
                                const paidAmount = Number(treatment.paid_amount);
                                const description = treatment.comment ?? treatment.description ?? '';
                                const isDetailLoading = detailLoadingTreatmentId === treatment.id;
                                const isMediaSyncing = mediaSyncingTreatmentIds.includes(treatment.id);
                                const canAddImages = historyManageDisplayMode === 'enabled'
                                    && imageCount < maxHistoryImagesPerEntry;
                                const isManageReadonly = historyManageDisplayMode === 'disabled-readonly';
                                const isEditDisabled = isManageReadonly || isDetailLoading;

                                if (isDialogOpen && editingTreatment?.id === treatment.id) {
                                    return renderTreatmentFormCard('edit');
                                }

                                return (
                                    <article key={treatment.id} className="relative grid gap-2 md:grid-cols-[96px_minmax(0,1fr)]">
                                        <div className="hidden grid-cols-[1fr_24px] items-start gap-2 pt-5 md:grid">
                                            <TimelineDate date={treatment.treatment_date} />
                                            <span className="relative z-10 mt-0.5 h-3.5 w-3.5 justify-self-center rounded-full border-2 border-white bg-teal-500 shadow-sm ring-4 ring-teal-50" />
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                                        <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold tabular-nums text-slate-600 md:hidden">
                                                            {formatDate(treatment.treatment_date)}
                                                        </span>
                                                    </div>
                                                    <h3 className="break-words text-sm font-semibold leading-snug text-slate-950 sm:text-base" title={treatment.treatment_type}>
                                                        {treatment.treatment_type}
                                                    </h3>
                                                </div>
                                                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                                                    {showRecordAuthors ? (
                                                        <RecordAuthorBadge
                                                            className="max-w-40"
                                                            createdBy={treatment.created_by}
                                                            updatedBy={treatment.updated_by}
                                                        />
                                                    ) : null}
                                                    {historyManageDisplayMode === 'hidden' ? null : (
                                                        <>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon-sm"
                                                            className="h-8 w-8 border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                                            aria-label={t('patientHistory.editEntry')}
                                                            disabled={isEditDisabled}
                                                            onClick={() => {
                                                                if (isManageReadonly) {
                                                                    toast.error(manageDeniedMessage);
                                                                    return;
                                                                }
                                                                void openEditDialog(treatment);
                                                            }}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon-sm"
                                                            className="h-8 w-8 border-red-200 bg-red-50 text-red-600 shadow-sm hover:bg-red-100 hover:text-red-700"
                                                            aria-label={t('patientHistory.deleteEntry')}
                                                            disabled={isManageReadonly}
                                                            onClick={() => {
                                                                if (isManageReadonly) {
                                                                    toast.error(manageDeniedMessage);
                                                                    return;
                                                                }
                                                                setTreatmentToDelete(treatment);
                                                            }}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-3">
                                                <HistoryImageStrip
                                                    treatment={treatment}
                                                    patientName={patientName}
                                                    imageLabel={t('patientHistory.image')}
                                                    emptyLabel={t('patientHistory.imagesEmpty')}
                                                    addImageLabel={t('odontogram.image.upload')}
                                                    uploadingLabel={t('patientHistory.imagesUploading')}
                                                    processingLabel={t('patientHistory.imagesProcessing')}
                                                    isDetailLoading={isDetailLoading}
                                                    isSyncing={isMediaSyncing}
                                                    canAddImages={canAddImages}
                                                    onOpen={(startIndex) => {
                                                        void openTreatmentImageGallery(treatment, startIndex);
                                                    }}
                                                    onAddImage={() => {
                                                        void openEditDialog(treatment);
                                                    }}
                                                />
                                            </div>
                                            {description ? (
                                                <p className="mt-2 line-clamp-2 break-words text-xs leading-5 text-slate-500 sm:text-sm">
                                                    {description}
                                                </p>
                                            ) : null}
                                            <div className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2">
                                                <HistoryFinanceChip
                                                    label={t('patientHistory.table.debt')}
                                                    value={canViewFinancials ? formatCurrency(debtAmount, treatmentCurrency) : t('dashboard.lockedKpi.label')}
                                                    tone="red"
                                                    locked={!canViewFinancials}
                                                />
                                                <HistoryFinanceChip
                                                    label={t('patientHistory.table.paid')}
                                                    value={canViewFinancials ? formatCurrency(paidAmount, treatmentCurrency) : t('dashboard.lockedKpi.label')}
                                                    tone="green"
                                                    locked={!canViewFinancials}
                                                />
                                            </div>
                                        </div>
                                    </article>
                                );
                                })}
                            </div>
                            {treatmentsQuery.hasNextPage ? (
                                <div className="flex justify-center border-t border-slate-100 pt-4">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="min-w-44"
                                        disabled={treatmentsQuery.isFetchingNextPage}
                                        onClick={() => {
                                            void treatmentsQuery.fetchNextPage();
                                        }}
                                    >
                                        {treatmentsQuery.isFetchingNextPage ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                {t('patientHistory.loadingMore')}
                                            </>
                                        ) : (
                                            t('patientHistory.loadMore')
                                        )}
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                    )}
                </CardContent>
            </Card>

            <ConfirmActionDialog
                open={treatmentToDelete !== null}
                onOpenChange={(open) => !open && setTreatmentToDelete(null)}
                title={t('patientHistory.deleteTitle')}
                description={treatmentToDelete ? t('patientHistory.deleteDescription', { date: formatDate(treatmentToDelete.treatment_date), workDone: treatmentToDelete.treatment_type }) : t('payments.deleteFallback')}
                confirmLabel={t('payments.confirmDelete')}
                pendingLabel={t('payments.deleting')}
                isPending={deleteTreatmentMutation.isPending}
                onConfirm={() => {
                    if (!canManageHistory) {
                        toast.error(manageDeniedMessage);
                        return;
                    }

                    if (treatmentToDelete) {
                        deleteTreatmentMutation.mutate(treatmentToDelete.id);
                    }
                }}
            />

            {previewGallery ? (
                <PatientPhotoPreviewDialog
                    key={`${previewGallery.startIndex}:${previewGallery.images.map((image) => image.src).join('|')}`}
                    open={previewGallery !== null}
                    onOpenChange={(open) => !open && setPreviewGallery(null)}
                    images={previewGallery.images}
                    startIndex={previewGallery.startIndex}
                    src={previewGallery.images[0]?.src ?? null}
                    alt={previewGallery.images[0]?.alt ?? ''}
                    title={previewGallery.images[0]?.title ?? previewGallery.fallbackTitle ?? patientName}
                    onSaveEditedImage={historyManageDisplayMode === 'enabled' ? async (image, file) => {
                        if (!image.id) {
                            throw new Error(t('gallery.edit.failed'));
                        }

                        if (!previewGallery.treatmentId) {
                            await saveEditedPendingTreatmentImage(image, file);
                            return;
                        }

                        await saveEditedTreatmentImageMutation.mutateAsync({
                            treatmentId: previewGallery.treatmentId,
                            imageId: image.id,
                            file,
                        });
                    } : undefined}
                    isEditPending={saveEditedTreatmentImageMutation.isPending || isSavingPendingImageEdit}
                />
            ) : null}
        </>
    );
}
