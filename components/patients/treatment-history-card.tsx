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
import { getBalanceMetricTone, MetricSummaryCard } from '@/components/ui/metric-summary-card';
import type { PreviewGalleryImage } from '@/components/patients/patient-photo-preview-dialog';
import { ClinicalSnapshotCard } from '@/components/patients/clinical-snapshot-card';
import { optimizeImageFilesForUpload } from '@/lib/browser-image';
import { getProtectedMediaCrossOrigin, getProtectedMediaPreviewUrl, getProtectedMediaThumbnailUrl, isProtectedMediaApproved } from '@/lib/protected-media';
import { formatCurrency, formatDate, toLocalDateKey } from '@/lib/utils';
import { toast } from 'sonner';
import { CalendarDays, Download, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { buildPdfFilename, exportPatientReportToPdf } from '@/lib/export/pdf';
import { EmptyState } from '@/components/ui/empty-state';
import { canManage, getManageDeniedMessage } from '@/lib/auth/permissions';

const UPPER_RIGHT_TEETH = [8, 7, 6, 5, 4, 3, 2, 1];
const UPPER_LEFT_TEETH = [9, 10, 11, 12, 13, 14, 15, 16];
const LOWER_RIGHT_TEETH = [32, 31, 30, 29, 28, 27, 26, 25];
const LOWER_LEFT_TEETH = [17, 18, 19, 20, 21, 22, 23, 24];
const UPPER_TEETH = [...UPPER_RIGHT_TEETH, ...UPPER_LEFT_TEETH];
const LOWER_TEETH = [...LOWER_RIGHT_TEETH, ...LOWER_LEFT_TEETH];

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
const DEFAULT_HISTORY_STORED_MAX_MB = 1;
const ALLOWED_HISTORY_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);
const HISTORY_IMAGE_UPLOAD_CONCURRENCY = 10;
const MEDIA_READINESS_POLL_INTERVAL_MS = 1200;
const MEDIA_READINESS_TIMEOUT_MS = 8000;
const HISTORY_TABLE_GRID_CLASS = 'hidden lg:grid lg:min-w-[980px] lg:grid-cols-[120px_96px_minmax(220px,1.4fr)_116px_116px_120px_160px_84px] lg:gap-3';
const HISTORY_HEADER_GRID_CLASS = HISTORY_TABLE_GRID_CLASS;

const PatientPhotoPreviewDialog = dynamic(
    () => import('@/components/patients/patient-photo-preview-dialog').then((module) => module.PatientPhotoPreviewDialog),
    { ssr: false }
);

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
    return teeth.length > 0 ? teeth.join(', ') : '-';
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
        treatment.images?.length ?? 0
    );
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

function getTreatmentPrimaryImage(treatment: ApiTreatment) {
    if ((treatment.images?.length ?? 0) > 0) {
        return treatment.images[0];
    }

    return treatment.primary_image ?? null;
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

function ToothCell({
    selected,
    label,
}: {
    selected: boolean;
    label: number;
}) {
    return (
        <div
            className={`flex h-full w-full items-center justify-center rounded-md border text-xs font-semibold transition-colors ${
                selected
                    ? 'border-teal-600 bg-teal-500 text-white shadow-sm shadow-teal-200 ring-2 ring-teal-200'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:bg-teal-50'
            }`}
        >
            {label}
        </div>
    );
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
    const subscription = currentUserQuery.data?.subscription;
    const maxHistoryImagesPerEntry = subscription?.entry_image_limit ?? MAX_HISTORY_IMAGES_PER_ENTRY;
    const maxHistoryUploadMb = subscription?.upload_max_mb ?? DEFAULT_HISTORY_UPLOAD_MAX_MB;
    const maxHistoryStoredMb = subscription?.stored_image_max_mb ?? DEFAULT_HISTORY_STORED_MAX_MB;
    const maxHistoryUploadBytes = maxHistoryUploadMb * 1024 * 1024;
    const maxHistoryStoredBytes = maxHistoryStoredMb * 1024 * 1024;

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
        if ((treatment.images?.length ?? 0) > 0 || getTreatmentImageCount(treatment) === 0) {
            return treatment;
        }

        const detailQueryKey = getTreatmentDetailQueryKey(treatment.id);
        const cachedDetail = queryClient.getQueryData<ApiTreatment>(detailQueryKey);

        if (cachedDetail && (cachedDetail.images?.length ?? 0) > 0) {
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
            const payload = {
                treatment_date: formState.treatmentDate,
                treatment_type: formState.treatmentType.trim(),
                comment: formState.comment.trim() || undefined,
                teeth: formState.teeth,
                tooth_number: formState.teeth[0] ?? null,
                debt_amount: Number(formState.debtAmount || 0),
                paid_amount: Number(formState.paidAmount || 0),
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
                .map((file) => validateHistoryImageFile(file, t, maxHistoryStoredBytes, maxHistoryStoredMb))
                .find(Boolean) ?? ''
            : '';
    const visibleExistingImagesCount = editingTreatment
        ? getVisibleTreatmentImages(editingTreatment, formState.removeImageIds).length
        : 0;
    const isEditingImagePanelLoading = Boolean(
        editingTreatment
        && detailLoadingTreatmentId === editingTreatment.id
        && getTreatmentImageCount(editingTreatment) > 0
        && (editingTreatment.images?.length ?? 0) === 0
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
    const manageDeniedMessage = getManageDeniedMessage(currentUserQuery.data);

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

        if ((treatment.images?.length ?? 0) > 0 || getTreatmentImageCount(treatment) === 0) {
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
            const optimizedFiles = await optimizeImageFilesForUpload(filesToAdd, {
                concurrency: 4,
                targetMaxBytes: maxHistoryStoredBytes,
            });
            const uploadableFiles = optimizedFiles.filter((file) => file.size <= maxHistoryStoredBytes);
            if (uploadableFiles.length < optimizedFiles.length) {
                toast.error(t('patientHistory.validation.imageSize', { sizeMb: maxHistoryStoredMb }));
            }

            setFormState((current) => ({
                ...current,
                imageFiles: [...current.imageFiles, ...uploadableFiles],
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
        const knownImages = treatment.images ?? [];
        const primaryImage = getTreatmentPrimaryImage(treatment);
        const fallbackDate = treatment.treatment_date;

        if (knownImages.length > 0) {
            const previewableImages = knownImages.filter((image) => getTreatmentImagePreviewUrl(image));

            if (previewableImages.length === 0) {
                return;
            }

            setPreviewGallery({
                images: previewableImages.map((image, index) => ({
                    src: getTreatmentImagePreviewUrl(image) ?? '',
                    thumbnailSrc: getTreatmentImageThumbnailUrl(image) ?? undefined,
                    alt: `${patientName} ${t('patientHistory.image')} ${index + 1}`,
                    title: `${t('patientHistory.image')} ${index + 1} - ${formatDate(fallbackDate)}`,
                })),
                startIndex: Math.min(startIndex, previewableImages.length - 1),
                fallbackTitle: patientName,
            });
        } else if (primaryImage && getTreatmentImagePreviewUrl(primaryImage)) {
            setPreviewGallery({
                images: [{
                    src: getTreatmentImagePreviewUrl(primaryImage) ?? '',
                    thumbnailSrc: getTreatmentImageThumbnailUrl(primaryImage) ?? undefined,
                    alt: `${patientName} ${t('patientHistory.image')} 1`,
                    title: `${t('patientHistory.image')} 1 - ${formatDate(fallbackDate)}`,
                }],
                startIndex: 0,
                fallbackTitle: patientName,
            });
        }

        if (knownImages.length > 0 || getTreatmentImageCount(treatment) === 0) {
            return;
        }

        setDetailLoadingTreatmentId(treatment.id);

        try {
            const detailedTreatment = await loadTreatmentDetail(treatment);
            const images = (detailedTreatment.images ?? []).filter((image) => getTreatmentImagePreviewUrl(image));

            if (!images || images.length === 0) {
                return;
            }

            const treatmentDate = detailedTreatment.treatment_date;

            setPreviewGallery({
                images: images.map((image, index) => ({
                    src: getTreatmentImagePreviewUrl(image) ?? '',
                    thumbnailSrc: getTreatmentImageThumbnailUrl(image) ?? undefined,
                    alt: `${patientName} ${t('patientHistory.image')} ${index + 1}`,
                    title: `${t('patientHistory.image')} ${index + 1} - ${formatDate(treatmentDate)}`,
                })),
                startIndex: Math.min(startIndex, images.length - 1),
                fallbackTitle: patientName,
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
                                    const treatmentRows = treatments.map((tr) => [
                                        formatDate(tr.treatment_date),
                                        formatTeeth(tr.teeth ?? []) || '-',
                                        tr.treatment_type,
                                        formatCurrency(Number(tr.debt_amount ?? 0)),
                                        formatCurrency(Number(tr.paid_amount ?? 0)),
                                        formatCurrency(Number(tr.balance ?? 0)),
                                    ]);
                                    exportPatientReportToPdf({
                                        filename: buildPdfFilename(`patient-${patientName.replace(/\s+/g, '-').toLowerCase()}`),
                                        title: t('patientHistory.title'),
                                        patientName,
                                        patientMeta: [
                                            t('patientDetail.totalAppointments') + ': ' + treatments.length,
                                            new Date().toLocaleDateString(),
                                        ],
                                        summary: [
                                            { label: t('patientHistory.totalDebt'), value: formatCurrency(summary.totalDebt), tone: 'red' },
                                            { label: t('patientHistory.totalPaid'), value: formatCurrency(summary.totalPaid), tone: 'green' },
                                            { label: t('patientHistory.netBalance'), value: formatCurrency(summary.netBalance), tone: 'yellow' },
                                        ],
                                        sections: [
                                            {
                                                title: t('patientHistory.title'),
                                                table: {
                                                    columns: [
                                                        t('patientHistory.table.date'),
                                                        t('patientHistory.teethLabel'),
                                                        t('patientHistory.table.workDone'),
                                                        t('patientHistory.table.debt'),
                                                        t('patientHistory.table.paid'),
                                                        t('patientHistory.table.remaining'),
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
                        <Button onClick={openCreateDialog} disabled={!canManageHistory}>
                            <Plus className="h-4 w-4" />
                            {t('patientHistory.addEntry')}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <ClinicalSnapshotCard
                        patientId={patientId}
                        treatments={treatments}
                        isTreatmentsLoading={treatmentsQuery.isLoading}
                        isTreatmentsError={treatmentsQuery.isError}
                    />

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <MetricSummaryCard label={t('patientHistory.totalDebt')} value={formatCurrency(summary.totalDebt)} tone="red" />
                        <MetricSummaryCard label={t('patientHistory.totalPaid')} value={formatCurrency(summary.totalPaid)} tone="emerald" />
                        <MetricSummaryCard
                            label={t('patientHistory.netBalance')}
                            value={formatCurrency(summary.netBalance)}
                            tone={getBalanceMetricTone(summary.netBalance)}
                        />
                    </div>

                    {isLoading ? (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white pb-1">
                            <div className={`${HISTORY_HEADER_GRID_CLASS} border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500`}>
                                <span>{t('patientHistory.table.date')}</span>
                                <span>{t('patientHistory.teethLabel')}</span>
                                <span>{t('patientHistory.table.workDone')}</span>
                                <span>{t('patientHistory.table.debt')}</span>
                                <span>{t('patientHistory.table.paid')}</span>
                                <span>{t('patientHistory.table.remaining')}</span>
                                <span>{t('patientHistory.images')}</span>
                                <span className="text-right" />
                            </div>
                            <div className="divide-y divide-slate-100">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div key={index} className={`${HISTORY_TABLE_GRID_CLASS} items-start px-4 py-4`}>
                                        <Skeleton className="h-4 w-24" />
                                        <Skeleton className="h-6 w-24 rounded-full" />
                                        <div className="space-y-2">
                                            <Skeleton className="h-4 w-40" />
                                            <Skeleton className="h-3 w-full" />
                                        </div>
                                        <Skeleton className="h-4 w-20" />
                                        <Skeleton className="h-4 w-20" />
                                        <Skeleton className="h-4 w-24" />
                                        <div className="flex gap-2">
                                            <Skeleton className="h-7 w-16 rounded-full" />
                                            <Skeleton className="h-7 w-16 rounded-full" />
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <Skeleton className="h-8 w-8 rounded-lg" />
                                            <Skeleton className="h-8 w-8 rounded-lg" />
                                        </div>
                                    </div>
                                ))}
                            </div>
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
                                action={(
                                    <Button variant="outline" onClick={openCreateDialog} disabled={!canManageHistory}>
                                        <Plus className="h-4 w-4 mr-1.5" />
                                        {t('patientHistory.addFirstEntry')}
                                    </Button>
                                )}
                            />
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white pb-1">
                            <div className={`${HISTORY_HEADER_GRID_CLASS} border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500`}>
                                <span>{t('patientHistory.table.date')}</span>
                                <span>{t('patientHistory.teethLabel')}</span>
                                <span>{t('patientHistory.table.workDone')}</span>
                                <span>{t('patientHistory.table.debt')}</span>
                                <span>{t('patientHistory.table.paid')}</span>
                                <span>{t('patientHistory.table.remaining')}</span>
                                <span>{t('patientHistory.images')}</span>
                                <span className="text-right" />
                            </div>
                            <div className="divide-y divide-slate-100">
                                {treatments.map((treatment) => {
                                    const teeth = treatment.teeth ?? [];
                                    const firstTooth = teeth[0];
                                    const hiddenToothCount = Math.max(teeth.length - 1, 0);
                                    const debtAmount = Number(treatment.debt_amount);
                                    const paidAmount = Number(treatment.paid_amount);
                                    const balanceAmount = Number(treatment.balance);
                                    const treatmentImageCount = getTreatmentImageCount(treatment);
                                    const primaryImage = getTreatmentPrimaryImage(treatment);
                                    const primaryImageThumbnailUrl = primaryImage ? getTreatmentImageThumbnailUrl(primaryImage) : null;

                                    return (
                                    <div key={treatment.id}>
                                        {/* MOBILE COMPACT CARD */}
                                        <div className="space-y-2.5 px-3 py-3 lg:hidden">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                                    <span className="text-xs font-semibold tabular-nums text-slate-500">{formatDate(treatment.treatment_date)}</span>
                                                    {teeth.length === 0 ? null : (
                                                        <div className="flex flex-wrap items-center gap-1" title={formatTeeth(teeth)}>
                                                            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-700">
                                                                {firstTooth}
                                                            </span>
                                                            {hiddenToothCount > 0 ? (
                                                                <span className="inline-flex h-6 items-center justify-center rounded-full border border-teal-200 bg-teal-50 px-1.5 text-[11px] font-semibold text-teal-700">
                                                                    +{hiddenToothCount}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1.5">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon-sm"
                                                        className="h-8 w-8 border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                                        aria-label={t('patientHistory.editEntry')}
                                                        disabled={detailLoadingTreatmentId === treatment.id || !canManageHistory}
                                                        onClick={() => { void openEditDialog(treatment); }}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="icon-sm"
                                                        className="h-8 w-8 border-red-200 bg-red-50 text-red-600 shadow-sm hover:bg-red-100 hover:text-red-700"
                                                        aria-label={t('patientHistory.deleteEntry')}
                                                        disabled={!canManageHistory}
                                                        onClick={() => {
                                                            if (!canManageHistory) { toast.error(manageDeniedMessage); return; }
                                                            setTreatmentToDelete(treatment);
                                                        }}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <p className="text-sm font-semibold leading-snug text-slate-900 break-words" title={treatment.treatment_type}>
                                                {treatment.treatment_type}
                                            </p>
                                            <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2">
                                                <div>
                                                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t('patientHistory.table.debt')}</p>
                                                    <p className="mt-0.5 truncate text-xs font-bold tabular-nums text-red-700">{formatCurrency(debtAmount)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t('patientHistory.table.paid')}</p>
                                                    <p className="mt-0.5 truncate text-xs font-bold tabular-nums text-green-700">{formatCurrency(paidAmount)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{t('patientHistory.table.remaining')}</p>
                                                    <p className="mt-0.5 truncate text-xs font-bold tabular-nums text-yellow-800">{formatCurrency(balanceAmount)}</p>
                                                </div>
                                            </div>
                                            {treatmentImageCount > 0 && primaryImageThumbnailUrl ? (
                                                <button
                                                    type="button"
                                                    className="group inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-teal-400 hover:bg-teal-50"
                                                    onClick={() => { void openTreatmentImageGallery(treatment, 0); }}
                                                    aria-label={`${t('patientHistory.images')} (${treatmentImageCount})`}
                                                >
                                                    <span className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img
                                                            src={primaryImageThumbnailUrl}
                                                            alt={`${patientName} ${t('patientHistory.image')} 1`}
                                                            crossOrigin={getProtectedMediaCrossOrigin(primaryImageThumbnailUrl)}
                                                            className="h-full w-full object-cover"
                                                            loading="lazy"
                                                        />
                                                    </span>
                                                    <span className="inline-flex h-5 items-center rounded-md bg-teal-100 px-1.5 text-[11px] font-bold text-teal-700">+{treatmentImageCount}</span>
                                                </button>
                                            ) : null}
                                        </div>

                                        {/* DESKTOP GRID ROW */}
                                        <div className={`${HISTORY_TABLE_GRID_CLASS} items-start px-4 py-4 transition-colors hover:bg-slate-50/50`}>
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:sr-only">{t('patientHistory.table.date')}</p>
                                            <p className="text-sm text-slate-700">{formatDate(treatment.treatment_date)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:sr-only">{t('patientHistory.teethLabel')}</p>
                                            {(() => {
                                                const teeth = treatment.teeth ?? [];
                                                if (teeth.length === 0) {
                                                    return (
                                                        <span className="inline-flex h-7 items-center rounded-full border border-dashed border-slate-200 px-3 text-xs font-medium text-slate-400">
                                                            -
                                                        </span>
                                                    );
                                                }

                                                const firstTooth = teeth[0];
                                                const hiddenCount = Math.max(teeth.length - 1, 0);

                                                return (
                                                    <div className="flex flex-wrap items-center gap-1.5" title={formatTeeth(teeth)}>
                                                        <span
                                                            className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                                                        >
                                                            {firstTooth}
                                                        </span>
                                                        {hiddenCount > 0 ? (
                                                            <span className="inline-flex h-7 items-center justify-center rounded-full border border-teal-200 bg-teal-50 px-2.5 text-xs font-semibold text-teal-700">
                                                                +{hiddenCount}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:sr-only">{t('patientHistory.table.workDone')}</p>
                                            <p
                                                className="max-w-[220px] truncate text-sm font-semibold text-slate-900 sm:max-w-[260px] lg:max-w-[300px] xl:max-w-[340px]"
                                                title={treatment.treatment_type}
                                            >
                                                {treatment.treatment_type}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:sr-only">{t('patientHistory.table.debt')}</p>
                                            <p className="whitespace-nowrap text-sm font-semibold text-red-700">{formatCurrency(Number(treatment.debt_amount))}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:sr-only">{t('patientHistory.table.paid')}</p>
                                            <p className="whitespace-nowrap text-sm font-semibold text-green-700">{formatCurrency(Number(treatment.paid_amount))}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:sr-only">{t('patientHistory.table.remaining')}</p>
                                            <p className="whitespace-nowrap text-sm font-semibold text-yellow-800">
                                                {formatCurrency(Number(treatment.balance))}
                                            </p>
                                        </div>
                                        <div className="lg:flex lg:items-center">
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 lg:sr-only">{t('patientHistory.images')}</p>
                                            {(() => {
                                                const treatmentImageCount = getTreatmentImageCount(treatment);
                                                const primaryImage = getTreatmentPrimaryImage(treatment);
                                                const isDetailLoading = detailLoadingTreatmentId === treatment.id;
                                                const isMediaSyncing = mediaSyncingTreatmentIds.includes(treatment.id);
                                                const primaryImageThumbnailUrl = primaryImage ? getTreatmentImageThumbnailUrl(primaryImage) : null;
                                                const hasApprovedPrimaryImage = primaryImage ? isProtectedMediaApproved(primaryImage.scan_status) : false;

                                                if (isMediaSyncing) {
                                                    return (
                                                        <span
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700"
                                                            title={t('patientHistory.imagesUploading')}
                                                        >
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        </span>
                                                    );
                                                }

                                                if (treatmentImageCount > 0 && primaryImage && (!hasApprovedPrimaryImage || !primaryImageThumbnailUrl)) {
                                                    return (
                                                        <span
                                                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700"
                                                            title={t('patientHistory.imagesProcessing')}
                                                            aria-label={t('patientHistory.imagesProcessing')}
                                                        >
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        </span>
                                                    );
                                                }

                                                if (treatmentImageCount === 0 || !primaryImage) {
                                                    return (
                                                        <span className="inline-flex h-8 min-w-[74px] items-center justify-center rounded-md border border-dashed border-slate-300 px-2 text-xs font-medium text-slate-400">
                                                            -
                                                        </span>
                                                    );
                                                }

                                                const primaryImageSrc = primaryImageThumbnailUrl ?? '';

                                                return (
                                                    <button
                                                        type="button"
                                                        disabled={isDetailLoading}
                                                        className="group inline-flex h-8 min-w-[74px] items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-teal-400 hover:bg-teal-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 active:translate-y-px active:shadow-sm"
                                                        onClick={() => {
                                                            void openTreatmentImageGallery(treatment, 0);
                                                        }}
                                                        title={`${t('patientHistory.images')}: ${treatmentImageCount}`}
                                                        aria-label={`${t('patientHistory.images')} (${treatmentImageCount})`}
                                                    >
                                                        <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={primaryImageSrc}
                                                                alt={`${patientName} ${t('patientHistory.image')} 1`}
                                                                crossOrigin={getProtectedMediaCrossOrigin(primaryImageSrc)}
                                                                className="h-full w-full object-cover"
                                                                loading="lazy"
                                                            />
                                                        </span>
                                                        <span className="inline-flex h-5 min-w-6 items-center justify-center rounded-md bg-teal-100 px-1.5 text-[11px] font-semibold text-teal-700">
                                                            +{treatmentImageCount}
                                                        </span>
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon-sm"
                                                className="border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                                aria-label={t('patientHistory.editEntry')}
                                                disabled={detailLoadingTreatmentId === treatment.id || !canManageHistory}
                                                onClick={() => {
                                                    void openEditDialog(treatment);
                                                }}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon-sm"
                                                className="border-red-200 bg-red-50 text-red-600 shadow-sm hover:bg-red-100 hover:text-red-700"
                                                aria-label={t('patientHistory.deleteEntry')}
                                                disabled={!canManageHistory}
                                                onClick={() => {
                                                    if (!canManageHistory) {
                                                        toast.error(manageDeniedMessage);
                                                        return;
                                                    }

                                                    setTreatmentToDelete(treatment);
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        </div>
                                    </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}                </CardContent>
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
                                <Input id="historyDate" type="date" required value={formState.treatmentDate} onChange={(event) => setFormState((current) => ({ ...current, treatmentDate: event.target.value }))} />
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
                            <Label>{t('patientHistory.teethLabel')}</Label>
                            <div>
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <p className="text-center text-sm font-medium text-slate-700">{t('odontogram.upperJaw')}</p>
                                        <div className="flex justify-center gap-3 md:gap-4 max-md:flex-col max-md:items-center max-md:gap-2">
                                            <div>
                                                <p className="mb-0.5 text-center text-xs text-slate-500">{t('odontogram.upperRight')}</p>
                                                <div className="flex gap-1 md:gap-0.5">
                                                    {UPPER_RIGHT_TEETH.map((toothNumber) => {
                                                        const isSelected = formState.teeth.includes(toothNumber);
                                                        return (
                                                            <button
                                                                key={toothNumber}
                                                                type="button"
                                                                className="h-9 w-7 rounded-md p-0 transition-colors md:w-6"
                                                                onClick={() =>
                                                                    setFormState((current) => ({
                                                                        ...current,
                                                                        teeth: isSelected
                                                                            ? current.teeth.filter((value) => value !== toothNumber)
                                                                            : [...current.teeth, toothNumber].sort((a, b) => a - b),
                                                                    }))
                                                                }
                                                                aria-pressed={isSelected}
                                                                title={t('odontogram.toothTitle', { toothNumber })}
                                                            >
                                                                <ToothCell selected={isSelected} label={toothNumber} />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="mb-0.5 text-center text-xs text-slate-500">{t('odontogram.upperLeft')}</p>
                                                <div className="flex gap-1 md:gap-0.5">
                                                    {UPPER_LEFT_TEETH.map((toothNumber) => {
                                                        const isSelected = formState.teeth.includes(toothNumber);
                                                        return (
                                                            <button
                                                                key={toothNumber}
                                                                type="button"
                                                                className="h-9 w-7 rounded-md p-0 transition-colors md:w-6"
                                                                onClick={() =>
                                                                    setFormState((current) => ({
                                                                        ...current,
                                                                        teeth: isSelected
                                                                            ? current.teeth.filter((value) => value !== toothNumber)
                                                                            : [...current.teeth, toothNumber].sort((a, b) => a - b),
                                                                    }))
                                                                }
                                                                aria-pressed={isSelected}
                                                                title={t('odontogram.toothTitle', { toothNumber })}
                                                            >
                                                                <ToothCell selected={isSelected} label={toothNumber} />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-center text-sm font-medium text-slate-700">{t('odontogram.lowerJaw')}</p>
                                        <div className="flex justify-center gap-3 md:gap-4 max-md:flex-col max-md:items-center max-md:gap-2">
                                            <div>
                                                <p className="mb-0.5 text-center text-xs text-slate-500">{t('odontogram.lowerRight')}</p>
                                                <div className="flex gap-1 md:gap-0.5">
                                                    {LOWER_RIGHT_TEETH.map((toothNumber) => {
                                                        const isSelected = formState.teeth.includes(toothNumber);
                                                        return (
                                                            <button
                                                                key={toothNumber}
                                                                type="button"
                                                                className="h-9 w-7 rounded-md p-0 transition-colors md:w-6"
                                                                onClick={() =>
                                                                    setFormState((current) => ({
                                                                        ...current,
                                                                        teeth: isSelected
                                                                            ? current.teeth.filter((value) => value !== toothNumber)
                                                                            : [...current.teeth, toothNumber].sort((a, b) => a - b),
                                                                    }))
                                                                }
                                                                aria-pressed={isSelected}
                                                                title={t('odontogram.toothTitle', { toothNumber })}
                                                            >
                                                                <ToothCell selected={isSelected} label={toothNumber} />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="mb-0.5 text-center text-xs text-slate-500">{t('odontogram.lowerLeft')}</p>
                                                <div className="flex gap-1 md:gap-0.5">
                                                    {LOWER_LEFT_TEETH.map((toothNumber) => {
                                                        const isSelected = formState.teeth.includes(toothNumber);
                                                        return (
                                                            <button
                                                                key={toothNumber}
                                                                type="button"
                                                                className="h-9 w-7 rounded-md p-0 transition-colors md:w-6"
                                                                onClick={() =>
                                                                    setFormState((current) => ({
                                                                        ...current,
                                                                        teeth: isSelected
                                                                            ? current.teeth.filter((value) => value !== toothNumber)
                                                                            : [...current.teeth, toothNumber].sort((a, b) => a - b),
                                                                    }))
                                                                }
                                                                aria-pressed={isSelected}
                                                                title={t('odontogram.toothTitle', { toothNumber })}
                                                            >
                                                                <ToothCell selected={isSelected} label={toothNumber} />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500">{t('patientHistory.teethHint')}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="historyDebt">{t('patientHistory.table.debt')}</Label>
                                <Input id="historyDebt" type="number" min="0" step="0.01" value={formState.debtAmount} onChange={(event) => setFormState((current) => ({ ...current, debtAmount: event.target.value }))} placeholder="0" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="historyPaid">{t('patientHistory.table.paid')}</Label>
                                <Input id="historyPaid" type="number" min="0" step="0.01" value={formState.paidAmount} onChange={(event) => setFormState((current) => ({ ...current, paidAmount: event.target.value }))} placeholder="0" />
                            </div>
                        </div>
                        {amountError ? <p className="text-xs text-red-600">{amountError}</p> : null}
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
                                                                    src: getTreatmentImagePreviewUrl(existingImage) ?? '',
                                                                    thumbnailSrc: getTreatmentImageThumbnailUrl(existingImage) ?? undefined,
                                                                    alt: `${patientName} ${t('patientHistory.image')} ${imageIndex + 1}`,
                                                                    title: `${t('patientHistory.image')} ${imageIndex + 1} - ${formatDate(formState.treatmentDate)}`,
                                                                })),
                                                                startIndex: Math.min(index, Math.max(previewableImages.length - 1, 0)),
                                                                fallbackTitle: patientName,
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
                                                    src: item.url,
                                                    alt: `${t('patientHistory.image')} ${imageIndex + 1}`,
                                                    title: `${t('patientHistory.image')} ${imageIndex + 1}`,
                                                })),
                                                startIndex: index,
                                                fallbackTitle: patientName,
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
                />
            ) : null}
        </>
    );
}
