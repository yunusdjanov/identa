'use client';

import dynamic from 'next/dynamic';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createPatientTreatment,
    deletePatientTreatment,
    deletePatientTreatmentImage,
    getCurrentUser,
    getPatientTreatment,
    listAllPatientTreatments,
    replacePatientTreatmentImage,
    updatePatientTreatment,
    uploadPatientTreatmentImages,
} from '@/lib/api/dentist';
import type { ApiTreatment, ApiTreatmentImage } from '@/lib/api/types';
import { getApiErrorMessage } from '@/lib/api/client';
import { useI18n } from '@/components/providers/i18n-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getBalanceMetricTone, MetricSummaryCard } from '@/components/ui/metric-summary-card';
import type { PreviewGalleryImage } from '@/components/patients/patient-photo-preview-dialog';
import { optimizeImageFilesForUpload } from '@/lib/browser-image';
import { getProtectedMediaCrossOrigin, getProtectedMediaPreviewUrl, getProtectedMediaThumbnailUrl, isProtectedMediaApproved } from '@/lib/protected-media';
import { formatToothList } from '@/lib/tooth-numbering';
import { formatCurrency, formatDate, toLocalDateKey } from '@/lib/utils';
import { toast } from 'sonner';
import { CalendarDays, Download, Loader2, Lock, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { buildPdfFilename, exportPatientReportToPdf } from '@/lib/export/pdf';
import { EmptyState } from '@/components/ui/empty-state';
import { canManage, canView, getManageDeniedMessage, isSubscriptionReadOnly } from '@/lib/auth/permissions';
import { RecordAuthorBadge } from '@/components/ui/record-author-badge';

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
const HISTORY_TIMELINE_IMAGE_LIMIT = 6;

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

function getBalanceExportTone(balance: number): 'yellow' | 'blue' | 'neutral' {
    const tone = getBalanceMetricTone(balance);

    if (tone === 'blue') {
        return 'blue';
    }

    if (tone === 'slate') {
        return 'neutral';
    }

    return 'yellow';
}

const createEmptyFormState = (): TreatmentFormState => ({
    treatmentDate: toLocalDateKey(),
    treatmentType: '',
    comment: '',
    debtAmount: '',
    paidAmount: '',
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
        debtAmount: treatment?.debt_amount ? String(Number(treatment.debt_amount)) : '',
        paidAmount: treatment?.paid_amount ? String(Number(treatment.paid_amount)) : '',
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

function HistoryImageTile({
    src,
    alt,
    markedForRemoval = false,
    onPreview,
    onToggleRemove,
    removeLabel,
    restoreLabel,
    isNew = false,
    processingLabel,
}: {
    src?: string | null;
    alt: string;
    markedForRemoval?: boolean;
    onPreview: () => void;
    onToggleRemove: () => void;
    removeLabel: string;
    restoreLabel: string;
    isNew?: boolean;
    processingLabel?: string;
}) {
    const canPreview = Boolean(src);

    return (
        <div
            className={`group relative h-14 w-14 overflow-hidden rounded-lg border bg-white shadow-sm transition-all ${
                markedForRemoval
                    ? 'border-red-200 opacity-70 ring-1 ring-red-100'
                    : isNew
                        ? 'border-teal-200 hover:border-teal-300 hover:shadow-md'
                        : 'border-slate-200 hover:border-teal-300 hover:shadow-md'
            }`}
        >
            <button
                type="button"
                className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 disabled:cursor-wait"
                onClick={onPreview}
                disabled={!canPreview}
                aria-label={alt}
                title={canPreview ? alt : processingLabel}
            >
                {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={src}
                        alt={alt}
                        crossOrigin={getProtectedMediaCrossOrigin(src)}
                        className={`h-full w-full object-cover transition-transform group-hover:scale-[1.03] ${
                            markedForRemoval ? 'grayscale' : ''
                        }`}
                        loading="lazy"
                    />
                ) : (
                    <span className="inline-flex h-full w-full items-center justify-center bg-slate-50 text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin opacity-70" />
                    </span>
                )}
            </button>
            <button
                type="button"
                className={`absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    markedForRemoval
                        ? 'border-teal-200 bg-white text-teal-700 hover:bg-teal-50'
                        : 'border-white/80 bg-red-600 text-white hover:bg-red-700'
                }`}
                onClick={onToggleRemove}
                aria-label={markedForRemoval ? restoreLabel : removeLabel}
                title={markedForRemoval ? restoreLabel : removeLabel}
            >
                {markedForRemoval ? <RotateCcw className="h-3 w-3" /> : <X className="h-3 w-3" />}
            </button>
        </div>
    );
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

    if (isSyncing) {
        return <HistoryImageStatus label={uploadingLabel} />;
    }

    if (imageCount === 0) {
        return (
            <div className="flex min-w-0 items-center gap-2">
                {canAddImages ? (
                    <HistoryAddImageButton label={addImageLabel} onClick={onAddImage} />
                ) : (
                    <p className="text-xs font-medium text-slate-400">{emptyLabel}</p>
                )}
            </div>
        );
    }

    if (visibleImages.length === 0) {
        return <HistoryImageStatus label={processingLabel} />;
    }

    return (
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
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
    );
}

function HistoryImageStatus({ label }: { label: string }) {
    return (
        <span
            className="inline-flex h-28 w-48 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-700 lg:h-32 lg:w-56"
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
            className="group relative h-28 w-48 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm transition-all hover:border-teal-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-70 lg:h-32 lg:w-56"
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
}: {
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            className="group inline-flex h-28 w-48 shrink-0 items-center justify-center rounded-xl border border-dashed border-teal-200 bg-teal-50/60 text-teal-700 transition-all hover:border-teal-300 hover:bg-teal-50 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 lg:h-32 lg:w-56"
            onClick={onClick}
            aria-label={label}
            title={label}
        >
            <Plus className="h-5 w-5 transition-transform group-hover:scale-110" />
        </button>
    );
}

export function TreatmentHistoryCard({ patientId, patientName }: TreatmentHistoryCardProps) {
    const { t } = useI18n();
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

    const treatmentsQuery = useQuery({
        queryKey: ['patients', 'detail', patientId, 'treatments'],
        queryFn: () => listAllPatientTreatments(patientId, {
            sort: '-treatment_date,-created_at',
            includeImages: false,
        }),
        staleTime: 30_000,
        gcTime: 300_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        placeholderData: (previousData) => previousData,
    });

    const treatments = useMemo(() => {
        const items = [...(treatmentsQuery.data ?? [])];
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
        const totalDebt = treatments.reduce((sum, treatment) => sum + Number(treatment.debt_amount ?? 0), 0);
        const totalPaid = treatments.reduce((sum, treatment) => sum + Number(treatment.paid_amount ?? 0), 0);

        return {
            totalDebt,
            totalPaid,
            netBalance: totalDebt - totalPaid,
        };
    }, [treatments]);
    const netBalanceTone = getBalanceMetricTone(summary.netBalance);

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

        queryClient.setQueryData<ApiTreatment[]>(
            treatmentsQueryKey,
            (current) => {
                if (!current || current.length === 0) {
                    return [updatedTreatment];
                }

                const existingIndex = current.findIndex((treatment) => treatment.id === updatedTreatment.id);

                if (existingIndex === -1) {
                    return [updatedTreatment, ...current];
                }

                return current.map((treatment) => (
                    treatment.id === updatedTreatment.id ? updatedTreatment : treatment
                ));
            }
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
                    debt_amount: Number(formState.debtAmount || 0),
                    paid_amount: Number(formState.paidAmount || 0),
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
            const previousTreatments = queryClient.getQueryData<ApiTreatment[]>(treatmentsQueryKey);

            queryClient.setQueryData<ApiTreatment[]>(
                treatmentsQueryKey,
                (current) => current?.filter((treatment) => treatment.id !== treatmentId) ?? []
            );

            setTreatmentToDelete(null);

            return { previousTreatments };
        },
        onSuccess: () => {
            toast.success(t('patientHistory.toast.deleted'));
            invalidateHistory();
        },
        onError: (error, _treatmentId, context) => {
            if (context?.previousTreatments) {
                queryClient.setQueryData(
                    treatmentsQueryKey,
                    context.previousTreatments
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
        submitAttempted && [formState.debtAmount, formState.paidAmount].some((value) => Number(value || 0) < 0)
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

    const selectedImagePreviews = useMemo(
        () =>
            formState.imageFiles.map((file, index) => ({
                id: `${file.name}-${file.lastModified}-${index}`,
                file,
                url: URL.createObjectURL(file),
            })),
        [formState.imageFiles]
    );

    useEffect(() => {
        return () => {
            selectedImagePreviews.forEach((preview) => {
                URL.revokeObjectURL(preview.url);
            });
        };
    }, [selectedImagePreviews]);

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

    return (
        <>
            <Card className="interactive-card rounded-2xl border-slate-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <CardTitle>{t('patientHistory.title')}</CardTitle>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        {subscription?.can_export ? (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    // PDF payload mirrors the on-screen gating: viewers
                                    // without `payments.view` get a slimmer PDF with
                                    // clinical columns only. Without this, an
                                    // assistant whose UI hides debt/paid/remaining
                                    // could still print them via the export button
                                    // (gated only by can_export at the subscription
                                    // level). Keep clinical context (date/teeth/work).
                                    const treatmentRows = treatments.map((tr) => canViewFinancials
                                        ? (() => {
                                            const balance = Number(tr.balance ?? 0);

                                            return [
                                                formatDate(tr.treatment_date),
                                                formatTeeth(tr.teeth ?? []) || '-',
                                                tr.treatment_type,
                                                formatCurrency(Number(tr.debt_amount ?? 0)),
                                                formatCurrency(Number(tr.paid_amount ?? 0)),
                                                `${formatCurrency(Math.abs(balance))} (${t(getBalanceStatusKey(balance))})`,
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
                                        patientName,
                                        patientMeta: [
                                            t('patientDetail.totalAppointments') + ': ' + treatments.length,
                                            new Date().toLocaleDateString(),
                                        ],
                                        summary: canViewFinancials
                                            ? [
                                                { label: t('patientHistory.totalDebt'), value: formatCurrency(summary.totalDebt), tone: 'red' },
                                                { label: t('patientHistory.totalPaid'), value: formatCurrency(summary.totalPaid), tone: 'green' },
                                                {
                                                    label: `${t('patientHistory.netBalance')} · ${t(getBalanceStatusKey(summary.netBalance))}`,
                                                    value: formatCurrency(Math.abs(summary.netBalance)),
                                                    tone: getBalanceExportTone(summary.netBalance),
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
                                }}
                            >
                                <Download className="h-4 w-4" />
                                {t('common.export')}
                            </Button>
                        ) : null}
                        {historyManageDisplayMode === 'enabled' ? (
                            <Button onClick={openCreateDialog}>
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
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* When the viewer lacks payments.view the three financial
                        cards are kept in the layout but rendered as locked
                        placeholders (Lock icon + "No access"). The grid
                        shape stays consistent so the page doesn't visually
                        collapse — users see WHICH metric they don't have
                        access to, not just empty space. */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <MetricSummaryCard
                            label={t('patientHistory.totalDebt')}
                            value={formatCurrency(summary.totalDebt)}
                            tone="red"
                            locked={!canViewFinancials}
                        />
                        <MetricSummaryCard
                            label={t('patientHistory.totalPaid')}
                            value={formatCurrency(summary.totalPaid)}
                            tone="emerald"
                            locked={!canViewFinancials}
                        />
                        <MetricSummaryCard
                            label={t('patientHistory.netBalance')}
                            value={formatCurrency(Math.abs(summary.netBalance))}
                            tone={netBalanceTone}
                            badge={t(getBalanceStatusKey(summary.netBalance))}
                            badgeTone={netBalanceTone}
                            locked={!canViewFinancials}
                        />
                    </div>

                    {isLoading ? (
                        <div className="relative space-y-3">
                            <div className="absolute bottom-3 left-[106px] top-3 hidden w-px bg-slate-200 md:block" aria-hidden="true" />
                            {Array.from({ length: 3 }).map((_, index) => (
                                <div key={index} className="relative grid gap-2 md:grid-cols-[118px_minmax(0,1fr)]">
                                    <div className="hidden grid-cols-[1fr_24px] items-start gap-2 pt-5 md:grid">
                                        <Skeleton className="mt-0.5 h-4 w-20 justify-self-end" />
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
                    ) : treatments.length === 0 ? (
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
                        <div className="relative space-y-3">
                            <div className="absolute bottom-3 left-[106px] top-3 hidden w-px bg-slate-200 md:block" aria-hidden="true" />
                            {treatments.map((treatment) => {
                                const imageCount = getTreatmentImageCount(treatment);
                                const debtAmount = Number(treatment.debt_amount);
                                const paidAmount = Number(treatment.paid_amount);
                                const description = treatment.comment ?? treatment.description ?? '';
                                const isDetailLoading = detailLoadingTreatmentId === treatment.id;
                                const isMediaSyncing = mediaSyncingTreatmentIds.includes(treatment.id);
                                const canAddImages = historyManageDisplayMode === 'enabled'
                                    && imageCount < maxHistoryImagesPerEntry;
                                const isManageReadonly = historyManageDisplayMode === 'disabled-readonly';
                                const isEditDisabled = isManageReadonly || isDetailLoading;

                                return (
                                    <article key={treatment.id} className="relative grid gap-2 md:grid-cols-[118px_minmax(0,1fr)]">
                                        <div className="hidden grid-cols-[1fr_24px] items-start gap-2 pt-5 md:grid">
                                            <span className="text-right text-xs font-semibold leading-4 tabular-nums text-slate-500">
                                                {formatDate(treatment.treatment_date)}
                                            </span>
                                            <span className="relative z-10 mt-0.5 h-3.5 w-3.5 justify-self-center rounded-full border-2 border-white bg-teal-500 shadow-sm ring-4 ring-teal-50" />
                                        </div>
                                        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                                                        <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold tabular-nums text-slate-600 md:hidden">
                                                            {formatDate(treatment.treatment_date)}
                                                        </span>
                                                        {showRecordAuthors ? (
                                                            <RecordAuthorBadge
                                                                createdBy={treatment.created_by}
                                                                updatedBy={treatment.updated_by}
                                                            />
                                                        ) : null}
                                                    </div>
                                                    <h3 className="break-words text-sm font-semibold leading-snug text-slate-950 sm:text-base" title={treatment.treatment_type}>
                                                        {treatment.treatment_type}
                                                    </h3>
                                                </div>
                                                {historyManageDisplayMode === 'hidden' ? null : (
                                                    <div className="flex shrink-0 items-center gap-1.5">
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
                                                    </div>
                                                )}
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
                                                    value={canViewFinancials ? formatCurrency(debtAmount) : t('dashboard.lockedKpi.label')}
                                                    tone="red"
                                                    locked={!canViewFinancials}
                                                />
                                                <HistoryFinanceChip
                                                    label={t('patientHistory.table.paid')}
                                                    value={canViewFinancials ? formatCurrency(paidAmount) : t('dashboard.lockedKpi.label')}
                                                    tone="green"
                                                    locked={!canViewFinancials}
                                                />
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
                <DialogContent className="grid max-h-[calc(100dvh-1.5rem)] w-[min(96vw,980px)] max-w-[980px] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-4 sm:p-5">
                    <DialogHeader>
                        <DialogTitle>{editingTreatment ? t('patientHistory.editEntry') : t('patientHistory.addEntry')}</DialogTitle>
                        <DialogDescription>{editingTreatment ? t('patientHistory.editDescription', { patientName }) : t('patientHistory.addDescription', { patientName })}</DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="historyDate">
                                    {t('patientHistory.table.date')} <span className="text-red-500">*</span>
                                </Label>
                                <Input id="historyDate" type="date" required max={toLocalDateKey(new Date())} value={formState.treatmentDate} onChange={(event) => setFormState((current) => ({ ...current, treatmentDate: event.target.value }))} />
                                {dateError ? <p className="text-xs text-red-600">{dateError}</p> : null}
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="historyWorkDone">
                                    {t('patientHistory.table.workDone')} <span className="text-red-500">*</span>
                                </Label>
                                <Input id="historyWorkDone" required value={formState.treatmentType} onChange={(event) => setFormState((current) => ({ ...current, treatmentType: event.target.value }))} placeholder={t('patientHistory.workDonePlaceholder')} />
                                {treatmentTypeError ? <p className="text-xs text-red-600">{treatmentTypeError}</p> : null}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="historyComment">{t('patientHistory.commentLabel')}</Label>
                            <Textarea
                                id="historyComment"
                                rows={3}
                                maxLength={5000}
                                value={formState.comment}
                                onChange={(event) => setFormState((current) => ({ ...current, comment: event.target.value }))}
                                placeholder={t('patientHistory.commentPlaceholder')}
                                className="min-h-24 resize-y"
                            />
                        </div>
                        {/* Financial inputs are gated on payments.view —
                            see TreatmentService::payload backend gate.
                            Without this, a clinical assistant editing a
                            treatment with the (hidden but empty) inputs
                            would POST debt=0/paid=0 and overwrite the
                            dentist owner's real values. Hiding here +
                            backend-side payload gate together close the
                            data-loss bug. */}
                        {canViewFinancials ? (
                            <>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="historyDebt">{t('patientHistory.table.debt')}</Label>
                                        <Input id="historyDebt" type="number" inputMode="decimal" min="0" step="0.01" value={formState.debtAmount} onChange={(event) => setFormState((current) => ({ ...current, debtAmount: event.target.value }))} placeholder="0" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="historyPaid">{t('patientHistory.table.paid')}</Label>
                                        <Input id="historyPaid" type="number" inputMode="decimal" min="0" step="0.01" value={formState.paidAmount} onChange={(event) => setFormState((current) => ({ ...current, paidAmount: event.target.value }))} placeholder="0" />
                                    </div>
                                </div>
                                {amountError ? <p className="text-xs text-red-600">{amountError}</p> : null}
                            </>
                        ) : null}
                        <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-2.5">
                            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <Label htmlFor="historyImages">{t('patientHistory.images')}</Label>
                                    <p className="mt-1 text-xs text-slate-500">
                                        {visibleExistingImagesCount + selectedImagePreviews.length} / {maxHistoryImagesPerEntry} - {t('patientHistory.imagesHint', { max: maxHistoryImagesPerEntry, sizeMb: maxHistoryUploadMb })}
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
                                <Label
                                    htmlFor={!canManageHistory || isPreparingImages ? undefined : 'historyImages'}
                                    className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-sm transition-colors ${!canManageHistory || isPreparingImages ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-slate-50'}`}
                                    onClick={() => {
                                        if (!canManageHistory) {
                                            toast.error(manageDeniedMessage);
                                        }
                                    }}
                                >
                                    <Plus className="h-4 w-4" />
                                    {isPreparingImages ? t('common.loading') : t('odontogram.image.upload')}
                                </Label>
                            </div>

                            <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto pr-1">
                                {isEditingImagePanelLoading ? (
                                    Array.from({ length: Math.min(editingTreatment ? getTreatmentImageCount(editingTreatment) : 0, 4) }).map((_, index) => (
                                        <Skeleton key={`image-loading-${index}`} className="h-16 w-16 rounded-lg" />
                                    ))
                                ) : editingTreatment ? (
                                    (() => {
                                        const existingImages = editingTreatment.images ?? [];

                                        return existingImages.map((image, index) => {
                                            const isMarkedForRemoval = formState.removeImageIds.includes(image.id);
                                            const imageLabel = `${t('patientHistory.image')} ${index + 1}`;
                                            const imageThumbnailUrl = getTreatmentImageThumbnailUrl(image);

                                            return (
                                                <HistoryImageTile
                                                    key={image.id}
                                                    src={imageThumbnailUrl}
                                                    alt={imageLabel}
                                                    markedForRemoval={isMarkedForRemoval}
                                                    onPreview={() =>
                                                        {
                                                            const previewableImages = existingImages.filter((existingImage) => getTreatmentImagePreviewUrl(existingImage));

                                                            setPreviewGallery({
                                                                images: previewableImages.map((existingImage, imageIndex) => ({
                                                                    id: existingImage.id,
                                                                    src: getTreatmentImagePreviewUrl(existingImage) ?? '',
                                                                    thumbnailSrc: getTreatmentImageThumbnailUrl(existingImage) ?? undefined,
                                                                    alt: `${patientName} ${t('patientHistory.image')} ${imageIndex + 1}`,
                                                                    title: `${t('patientHistory.image')} ${imageIndex + 1} - ${formatDate(formState.treatmentDate)}`,
                                                                })),
                                                                startIndex: Math.min(index, Math.max(previewableImages.length - 1, 0)),
                                                                fallbackTitle: patientName,
                                                                treatmentId: editingTreatment.id,
                                                                treatmentDate: formState.treatmentDate,
                                                            });
                                                        }
                                                    }
                                                    onToggleRemove={() => toggleExistingImageRemoval(image.id)}
                                                    removeLabel={t('patientHistory.removeImage')}
                                                    restoreLabel={t('patients.restore')}
                                                    processingLabel={t('patientHistory.imageProcessing')}
                                                />
                                            );
                                        });
                                    })()
                                ) : null}
                                {selectedImagePreviews.map((preview, index) => (
                                    <HistoryImageTile
                                        key={preview.id}
                                        src={preview.url}
                                        alt={`${t('patientHistory.image')} ${index + 1}`}
                                        onPreview={() => {
                                            setPreviewGallery({
                                                images: selectedImagePreviews.map((item, imageIndex) => ({
                                                    id: item.id,
                                                    src: item.url,
                                                    alt: `${t('patientHistory.image')} ${imageIndex + 1}`,
                                                    title: `${t('patientHistory.image')} ${imageIndex + 1}`,
                                                })),
                                                startIndex: index,
                                                fallbackTitle: patientName,
                                                treatmentId: '',
                                                treatmentDate: formState.treatmentDate,
                                            });
                                        }}
                                        onToggleRemove={() => removeSelectedImage(index)}
                                        removeLabel={t('patientHistory.removeImage')}
                                        restoreLabel={t('patients.restore')}
                                        isNew
                                    />
                                ))}
                                {(editingTreatment?.images ?? []).length + selectedImagePreviews.length === 0 ? (
                                    <span className="inline-flex h-8 items-center rounded-full border border-dashed border-slate-200 bg-white px-3 text-xs text-slate-400">
                                        {t('patientHistory.imagesEmpty')}
                                    </span>
                                ) : null}
                            </div>

                            {imageValidationError ? <p className="mt-2 text-xs text-red-600">{imageValidationError}</p> : null}
                            {maxImagesError ? <p className="mt-2 text-xs text-red-600">{maxImagesError}</p> : null}
                        </div>
                    </div>
                    <DialogFooter className="border-t border-slate-100 pt-3">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saveTreatmentMutation.isPending || isPreparingImages}>{t('common.cancel')}</Button>
                        <Button type="button" onClick={handleSubmit} disabled={saveTreatmentMutation.isPending || isPreparingImages || !canManageHistory}>{saveTreatmentMutation.isPending ? t('common.saving') : isPreparingImages ? t('common.loading') : t('common.saveChanges')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                    onSaveEditedImage={historyManageDisplayMode === 'enabled' && previewGallery.treatmentId ? async (image, file) => {
                        if (!image.id) {
                            throw new Error(t('gallery.edit.failed'));
                        }

                        await saveEditedTreatmentImageMutation.mutateAsync({
                            treatmentId: previewGallery.treatmentId,
                            imageId: image.id,
                            file,
                        });
                    } : undefined}
                    isEditPending={saveEditedTreatmentImageMutation.isPending}
                />
            ) : null}
        </>
    );
}
