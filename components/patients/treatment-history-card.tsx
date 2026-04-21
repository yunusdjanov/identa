'use client';

import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createPatientTreatment,
    deletePatientTreatment,
    deletePatientTreatmentImage,
    getPatientTreatment,
    listAllPatientTreatments,
    updatePatientTreatment,
    uploadPatientTreatmentImage,
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
import { PatientPhotoPreviewDialog, type PreviewGalleryImage } from '@/components/patients/patient-photo-preview-dialog';
import { ClinicalSnapshotCard } from '@/components/patients/clinical-snapshot-card';
import { optimizeImageFileForUpload } from '@/lib/browser-image';
import { getProtectedMediaCrossOrigin } from '@/lib/protected-media';
import { formatCurrency, formatDate, toLocalDateKey } from '@/lib/utils';
import { toast } from 'sonner';
import { CalendarDays, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';

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
const MAX_HISTORY_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_HISTORY_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);
const HISTORY_IMAGE_UPLOAD_CONCURRENCY = 3;

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

function validateHistoryImageFile(file: File, t: (key: string, params?: Record<string, string | number>) => string) {
    if (!file) {
        return '';
    }

    const normalizedName = file.name.toLowerCase();
    const hasAllowedExtension = ['.jpg', '.jpeg', '.png', '.webp'].some((extension) => normalizedName.endsWith(extension));
    const hasAllowedType = ALLOWED_HISTORY_IMAGE_TYPES.has(file.type);

    if (!hasAllowedType && !hasAllowedExtension) {
        return t('patientHistory.validation.imageType');
    }

    if (file.size > MAX_HISTORY_IMAGE_SIZE_BYTES) {
        return t('patientHistory.validation.imageSize');
    }

    return '';
}

function getVisibleTreatmentImages(treatment: ApiTreatment, removeImageIds: string[]) {
    return (treatment.images ?? []).filter((image) => !removeImageIds.includes(image.id));
}

function getTreatmentImageThumbnailUrl(image: ApiTreatmentImage) {
    return image.thumbnail_url ?? image.preview_url ?? image.url;
}

function getTreatmentImagePreviewUrl(image: ApiTreatmentImage) {
    return image.preview_url ?? image.url;
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
    uploadFile: (file: File) => Promise<unknown>
) {
    for (let start = 0; start < imageFiles.length; start += HISTORY_IMAGE_UPLOAD_CONCURRENCY) {
        const batch = imageFiles.slice(start, start + HISTORY_IMAGE_UPLOAD_CONCURRENCY);
        await Promise.all(batch.map((file) => uploadFile(file)));
    }
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
            className={`flex h-9 w-full items-center justify-center rounded-md border text-xs font-semibold transition-colors ${
                selected
                    ? 'border-blue-300 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-600'
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
}: {
    src: string;
    alt: string;
    markedForRemoval?: boolean;
    onPreview: () => void;
    onToggleRemove: () => void;
    removeLabel: string;
    restoreLabel: string;
    isNew?: boolean;
}) {
    return (
        <div
            className={`group relative h-16 w-16 overflow-hidden rounded-lg border bg-white shadow-sm transition-all ${
                markedForRemoval
                    ? 'border-red-200 opacity-70 ring-1 ring-red-100'
                    : isNew
                        ? 'border-blue-200 hover:border-blue-300 hover:shadow-md'
                        : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
            }`}
        >
            <button
                type="button"
                className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                onClick={onPreview}
                aria-label={alt}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={src}
                    alt={alt}
                    crossOrigin={getProtectedMediaCrossOrigin(src)}
                    className={`h-full w-full object-cover transition-transform group-hover:scale-[1.03] ${
                        markedForRemoval ? 'grayscale' : ''
                    }`}
                    loading="lazy"
                />
            </button>
            <button
                type="button"
                className={`absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    markedForRemoval
                        ? 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
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
        queryClient.invalidateQueries({ queryKey: ['patients', 'detail', patientId, 'treatments'] });
    };

    const refreshHistory = async () => {
        await queryClient.invalidateQueries({ queryKey: ['patients', 'detail', patientId, 'treatments'] });
    };

    const loadTreatmentDetail = async (treatment: ApiTreatment) => {
        if ((treatment.images?.length ?? 0) > 0 || getTreatmentImageCount(treatment) === 0) {
            return treatment;
        }

        return queryClient.fetchQuery({
            queryKey: ['patients', 'detail', patientId, 'treatments', treatment.id],
            queryFn: () => getPatientTreatment(patientId, treatment.id),
            staleTime: 300_000,
            gcTime: 300_000,
        });
    };

    useEffect(() => {
        const candidates = treatments
            .filter((treatment) => getTreatmentImageCount(treatment) > 0 && (treatment.images?.length ?? 0) === 0)
            .slice(0, 6);

        if (candidates.length === 0) {
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(() => {
            void (async () => {
                for (const treatment of candidates) {
                    if (cancelled) {
                        return;
                    }

                    try {
                        await queryClient.prefetchQuery({
                            queryKey: ['patients', 'detail', patientId, 'treatments', treatment.id],
                            queryFn: () => getPatientTreatment(patientId, treatment.id),
                            staleTime: 300_000,
                            gcTime: 300_000,
                        });
                    } catch {
                        return;
                    }
                }
            })();
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [patientId, queryClient, treatments]);

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
                    try {
                        if (removeImageIds.length > 0) {
                            await Promise.all(
                                removeImageIds.map((imageId) =>
                                    deletePatientTreatmentImage(patientId, treatment.id, imageId)
                                )
                            );
                        }

                        if (imageFiles.length > 0) {
                            await uploadTreatmentImagesInBatches(
                                imageFiles,
                                (imageFile) => uploadPatientTreatmentImage(patientId, treatment.id, imageFile)
                            );
                        }
                    } catch (error) {
                        toast.error(getApiErrorMessage(error, t('patientHistory.toast.imagesSyncFailed')));
                    } finally {
                        await refreshHistory();
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
            const queryKey = ['patients', 'detail', patientId, 'treatments'] as const;
            await queryClient.cancelQueries({ queryKey });
            const previousTreatments = queryClient.getQueryData<ApiTreatment[]>(queryKey);

            queryClient.setQueryData<ApiTreatment[]>(
                queryKey,
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
                    ['patients', 'detail', patientId, 'treatments'],
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
                .map((file) => validateHistoryImageFile(file, t))
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
        submitAttempted && visibleExistingImagesCount + formState.imageFiles.length > MAX_HISTORY_IMAGES_PER_ENTRY
            ? t('patientHistory.validation.maxImages', { max: MAX_HISTORY_IMAGES_PER_ENTRY })
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

    const handleSubmit = () => {
        setSubmitAttempted(true);
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
        setEditingTreatment(null);
        setFormState(createEmptyFormState());
        setSubmitAttempted(false);
        setIsDialogOpen(true);
    };

    const openEditDialog = async (treatment: ApiTreatment) => {
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

        const existingCount = editingTreatment
            ? getVisibleTreatmentImages(editingTreatment, formState.removeImageIds).length
            : 0;
        const availableSlots = Math.max(
            MAX_HISTORY_IMAGES_PER_ENTRY - existingCount - formState.imageFiles.length,
            0
        );
        const filesToAdd = selectedFiles.slice(0, availableSlots);

        if (filesToAdd.length === 0) {
            toast.error(t('patientHistory.validation.maxImages', { max: MAX_HISTORY_IMAGES_PER_ENTRY }));
            return;
        }

        if (filesToAdd.length < selectedFiles.length) {
            toast.error(t('patientHistory.validation.maxImages', { max: MAX_HISTORY_IMAGES_PER_ENTRY }));
        }

        setIsPreparingImages(true);

        try {
            const optimizedFiles: File[] = [];

            for (const file of filesToAdd) {
                optimizedFiles.push(await optimizeImageFileForUpload(file));
            }

            setFormState((current) => ({
                ...current,
                imageFiles: [...current.imageFiles, ...optimizedFiles],
            }));
        } finally {
            setIsPreparingImages(false);
        }
    };

    const removeSelectedImage = (index: number) => {
        setFormState((current) => ({
            ...current,
            imageFiles: current.imageFiles.filter((_, imageIndex) => imageIndex !== index),
        }));
    };

    const toggleExistingImageRemoval = (imageId: string) => {
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
            setPreviewGallery({
                images: knownImages.map((image, index) => ({
                    src: getTreatmentImagePreviewUrl(image),
                    thumbnailSrc: getTreatmentImageThumbnailUrl(image),
                    alt: `${patientName} ${t('patientHistory.image')} ${index + 1}`,
                    title: `${t('patientHistory.image')} ${index + 1} - ${formatDate(fallbackDate)}`,
                })),
                startIndex: Math.min(startIndex, knownImages.length - 1),
                fallbackTitle: patientName,
            });
        } else if (primaryImage) {
            setPreviewGallery({
                images: [{
                    src: getTreatmentImagePreviewUrl(primaryImage),
                    thumbnailSrc: getTreatmentImageThumbnailUrl(primaryImage),
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
            const images = detailedTreatment.images ?? [];

            if (!images || images.length === 0) {
                return;
            }

            const treatmentDate = detailedTreatment.treatment_date;

            setPreviewGallery({
                images: images.map((image, index) => ({
                    src: getTreatmentImagePreviewUrl(image),
                    thumbnailSrc: getTreatmentImageThumbnailUrl(image),
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
            <Card className="rounded-2xl border-gray-200 shadow-sm">
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <CardTitle>{t('patientHistory.title')}</CardTitle>
                    </div>
                    <Button onClick={openCreateDialog}>
                        <Plus className="h-4 w-4" />
                        {t('patientHistory.addEntry')}
                    </Button>
                </CardHeader>
                <CardContent className="space-y-6">
                    <ClinicalSnapshotCard
                        patientId={patientId}
                        treatments={treatments}
                        isTreatmentsLoading={treatmentsQuery.isLoading}
                        isTreatmentsError={treatmentsQuery.isError}
                    />

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-red-100 bg-red-50/60 p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-red-600">{t('patientHistory.totalDebt')}</p>
                            <p className="mt-1 text-lg font-semibold text-red-700">{formatCurrency(summary.totalDebt)}</p>
                        </div>
                        <div className="rounded-xl border border-green-100 bg-green-50/60 p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-green-600">{t('patientHistory.totalPaid')}</p>
                            <p className="mt-1 text-lg font-semibold text-green-700">{formatCurrency(summary.totalPaid)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-600">{t('patientHistory.netBalance')}</p>
                            <p className={`mt-1 text-lg font-semibold ${summary.netBalance > 0 ? 'text-red-700' : summary.netBalance < 0 ? 'text-green-700' : 'text-gray-700'}`}>
                                {formatCurrency(summary.netBalance)}
                            </p>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                            <div className="hidden grid-cols-[120px_110px_minmax(220px,1.6fr)_110px_110px_120px_180px_88px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 lg:grid">
                                <span>{t('patientHistory.table.date')}</span>
                                <span>{t('patientHistory.teethLabel')}</span>
                                <span>{t('patientHistory.table.workDone')}</span>
                                <span>{t('patientHistory.table.debt')}</span>
                                <span>{t('patientHistory.table.paid')}</span>
                                <span>{t('patientHistory.table.remaining')}</span>
                                <span>{t('patientHistory.images')}</span>
                                <span className="text-right" />
                            </div>
                            <div className="divide-y divide-gray-100">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div key={index} className="space-y-3 px-4 py-4 lg:grid lg:grid-cols-[120px_110px_minmax(220px,1.6fr)_110px_110px_120px_180px_88px] lg:items-start lg:gap-3 lg:space-y-0">
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
                        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center">
                            <CalendarDays className="mx-auto h-10 w-10 text-gray-300" />
                            <p className="mt-4 text-sm text-gray-500">{t('patientHistory.empty')}</p>
                            <Button variant="outline" className="mt-4" onClick={openCreateDialog}>
                                <Plus className="h-4 w-4" />
                                {t('patientHistory.addFirstEntry')}
                            </Button>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                            <div className="hidden grid-cols-[120px_110px_minmax(220px,1.6fr)_110px_110px_120px_180px_88px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 lg:grid">
                                <span>{t('patientHistory.table.date')}</span>
                                <span>{t('patientHistory.teethLabel')}</span>
                                <span>{t('patientHistory.table.workDone')}</span>
                                <span>{t('patientHistory.table.debt')}</span>
                                <span>{t('patientHistory.table.paid')}</span>
                                <span>{t('patientHistory.table.remaining')}</span>
                                <span>{t('patientHistory.images')}</span>
                                <span className="text-right" />
                            </div>
                            <div className="divide-y divide-gray-100">
                                {treatments.map((treatment) => (
                                    <div key={treatment.id} className="space-y-3 px-4 py-4 transition-colors hover:bg-gray-50/50 lg:grid lg:grid-cols-[120px_110px_minmax(220px,1.6fr)_110px_110px_120px_180px_88px] lg:items-start lg:gap-3 lg:space-y-0">
                                        <div>
                                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 lg:hidden">{t('patientHistory.table.date')}</p>
                                            <p className="text-sm text-gray-700">{formatDate(treatment.treatment_date)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 lg:hidden">{t('patientHistory.teethLabel')}</p>
                                            {(() => {
                                                const teeth = treatment.teeth ?? [];
                                                if (teeth.length === 0) {
                                                    return (
                                                        <span className="inline-flex h-7 items-center rounded-full border border-dashed border-gray-200 px-3 text-xs font-medium text-gray-400">
                                                            -
                                                        </span>
                                                    );
                                                }

                                                const firstTooth = teeth[0];
                                                const hiddenCount = Math.max(teeth.length - 1, 0);

                                                return (
                                                    <div className="flex flex-wrap items-center gap-1.5" title={formatTeeth(teeth)}>
                                                        <span
                                                            className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700"
                                                        >
                                                            {firstTooth}
                                                        </span>
                                                        {hiddenCount > 0 ? (
                                                            <span className="inline-flex h-7 items-center justify-center rounded-full border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700">
                                                                +{hiddenCount}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 lg:hidden">{t('patientHistory.table.workDone')}</p>
                                            <p
                                                className="max-w-[220px] truncate text-sm font-semibold text-gray-900 sm:max-w-[260px] lg:max-w-[300px] xl:max-w-[340px]"
                                                title={treatment.treatment_type}
                                            >
                                                {treatment.treatment_type}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 lg:hidden">{t('patientHistory.table.debt')}</p>
                                            <p className="text-sm font-semibold text-red-700">{formatCurrency(Number(treatment.debt_amount))}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 lg:hidden">{t('patientHistory.table.paid')}</p>
                                            <p className="text-sm font-semibold text-green-700">{formatCurrency(Number(treatment.paid_amount))}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 lg:hidden">{t('patientHistory.table.remaining')}</p>
                                            <p className={`text-sm font-semibold ${Number(treatment.balance) > 0 ? 'text-red-700' : 'text-green-700'}`}>
                                                {formatCurrency(Number(treatment.balance))}
                                            </p>
                                        </div>
                                        <div className="lg:flex lg:items-center">
                                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 lg:hidden">{t('patientHistory.images')}</p>
                                            {(() => {
                                                const treatmentImageCount = getTreatmentImageCount(treatment);
                                                const primaryImage = getTreatmentPrimaryImage(treatment);
                                                const isDetailLoading = detailLoadingTreatmentId === treatment.id;
                                                const isMediaSyncing = mediaSyncingTreatmentIds.includes(treatment.id);

                                                if (isMediaSyncing) {
                                                    return (
                                                        <span className="inline-flex h-8 min-w-[120px] items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2 text-xs font-medium text-blue-700">
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            {t('patientHistory.imagesUploading')}
                                                        </span>
                                                    );
                                                }

                                                if (treatmentImageCount === 0 || !primaryImage) {
                                                    return (
                                                        <span className="inline-flex h-8 min-w-[74px] items-center justify-center rounded-md border border-dashed border-gray-300 px-2 text-xs font-medium text-gray-400">
                                                            -
                                                        </span>
                                                    );
                                                }

                                                return (
                                                    <button
                                                        type="button"
                                                        disabled={isDetailLoading}
                                                        className="group inline-flex h-8 min-w-[74px] items-center gap-2 rounded-md border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 active:translate-y-px active:shadow-sm"
                                                        onClick={() => {
                                                            void openTreatmentImageGallery(treatment, 0);
                                                        }}
                                                        title={`${t('patientHistory.images')}: ${treatmentImageCount}`}
                                                        aria-label={`${t('patientHistory.images')} (${treatmentImageCount})`}
                                                    >
                                                        <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-[6px] border border-gray-200 bg-gray-100">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={getTreatmentImageThumbnailUrl(primaryImage)}
                                                                alt={`${patientName} ${t('patientHistory.image')} 1`}
                                                                crossOrigin={getProtectedMediaCrossOrigin(getTreatmentImageThumbnailUrl(primaryImage))}
                                                                className="h-full w-full object-cover"
                                                                loading="lazy"
                                                            />
                                                        </span>
                                                        <span className="inline-flex h-5 min-w-6 items-center justify-center rounded-[6px] bg-blue-100 px-1.5 text-[11px] font-semibold text-blue-700">
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
                                                className="border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-100"
                                                aria-label={t('patientHistory.editEntry')}
                                                disabled={detailLoadingTreatmentId === treatment.id}
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
                                                onClick={() => setTreatmentToDelete(treatment)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
                <DialogContent className="max-h-[92vh] w-[min(96vw,1040px)] max-w-[1040px] overflow-x-hidden overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingTreatment ? t('patientHistory.editEntry') : t('patientHistory.addEntry')}</DialogTitle>
                        <DialogDescription>{editingTreatment ? t('patientHistory.editDescription', { patientName }) : t('patientHistory.addDescription', { patientName })}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="historyDate">{t('patientHistory.table.date')}</Label>
                                <Input id="historyDate" type="date" value={formState.treatmentDate} onChange={(event) => setFormState((current) => ({ ...current, treatmentDate: event.target.value }))} />
                                {dateError ? <p className="text-xs text-red-600">{dateError}</p> : null}
                            </div>
                            <div className="space-y-2 sm:col-span-2">
                                <Label htmlFor="historyWorkDone">{t('patientHistory.table.workDone')}</Label>
                                <Input id="historyWorkDone" value={formState.treatmentType} onChange={(event) => setFormState((current) => ({ ...current, treatmentType: event.target.value }))} placeholder={t('patientHistory.workDonePlaceholder')} />
                                {treatmentTypeError ? <p className="text-xs text-red-600">{treatmentTypeError}</p> : null}
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>{t('patientHistory.teethLabel')}</Label>
                            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-2.5">
                                <div className="space-y-2">
                                    <div>
                                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">{t('odontogram.upperJaw')}</p>
                                        <div className="pb-1">
                                            <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
                                            {UPPER_TEETH.map((toothNumber) => {
                                                const isSelected = formState.teeth.includes(toothNumber);
                                                return (
                                                    <button
                                                        key={toothNumber}
                                                        type="button"
                                                        className="rounded-md border border-transparent p-0 transition-colors hover:border-gray-200"
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
                                    <div className="border-t border-gray-200" />
                                    <div>
                                        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">{t('odontogram.lowerJaw')}</p>
                                        <div className="pb-1">
                                            <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
                                            {LOWER_TEETH.map((toothNumber) => {
                                                const isSelected = formState.teeth.includes(toothNumber);
                                                return (
                                                    <button
                                                        key={toothNumber}
                                                        type="button"
                                                        className="rounded-md border border-transparent p-0 transition-colors hover:border-gray-200"
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
                            <p className="text-xs text-gray-500">{t('patientHistory.teethHint')}</p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                        <div className="rounded-xl border border-gray-200 bg-gray-50/40 p-3">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <Label htmlFor="historyImages">{t('patientHistory.images')}</Label>
                                    <p className="mt-1 text-xs text-gray-500">
                                        {visibleExistingImagesCount + selectedImagePreviews.length} / {MAX_HISTORY_IMAGES_PER_ENTRY} - {t('patientHistory.imagesHint', { max: MAX_HISTORY_IMAGES_PER_ENTRY })}
                                    </p>
                                </div>
                                <Input
                                    id="historyImages"
                                    type="file"
                                    multiple
                                    accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                                    onChange={handleImageFilesSelected}
                                    className="sr-only"
                                />
                                <Label
                                    htmlFor={isPreparingImages ? undefined : 'historyImages'}
                                    className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 shadow-sm transition-colors ${isPreparingImages ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-gray-50'}`}
                                >
                                    <Plus className="h-4 w-4" />
                                    {isPreparingImages ? t('common.loading') : t('odontogram.image.upload')}
                                </Label>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
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

                                            return (
                                                <HistoryImageTile
                                                    key={image.id}
                                                    src={getTreatmentImageThumbnailUrl(image)}
                                                    alt={imageLabel}
                                                    markedForRemoval={isMarkedForRemoval}
                                                    onPreview={() =>
                                                        setPreviewGallery({
                                                            images: existingImages.map((existingImage, imageIndex) => ({
                                                                src: getTreatmentImagePreviewUrl(existingImage),
                                                                thumbnailSrc: getTreatmentImageThumbnailUrl(existingImage),
                                                                alt: `${patientName} ${t('patientHistory.image')} ${imageIndex + 1}`,
                                                                title: `${t('patientHistory.image')} ${imageIndex + 1} - ${formatDate(formState.treatmentDate)}`,
                                                            })),
                                                            startIndex: index,
                                                            fallbackTitle: patientName,
                                                        })
                                                    }
                                                    onToggleRemove={() => toggleExistingImageRemoval(image.id)}
                                                    removeLabel={t('patientHistory.removeImage')}
                                                    restoreLabel={t('patients.restore')}
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
                                    <span className="inline-flex h-8 items-center rounded-full border border-dashed border-gray-200 bg-white px-3 text-xs text-gray-400">
                                        {t('patientHistory.imagesEmpty')}
                                    </span>
                                ) : null}
                            </div>

                            {imageValidationError ? <p className="mt-2 text-xs text-red-600">{imageValidationError}</p> : null}
                            {maxImagesError ? <p className="mt-2 text-xs text-red-600">{maxImagesError}</p> : null}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saveTreatmentMutation.isPending || isPreparingImages}>{t('common.cancel')}</Button>
                        <Button type="button" onClick={handleSubmit} disabled={saveTreatmentMutation.isPending || isPreparingImages}>{saveTreatmentMutation.isPending ? t('common.saving') : isPreparingImages ? t('common.loading') : t('common.saveChanges')}</Button>
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
                onConfirm={() => { if (treatmentToDelete) { deleteTreatmentMutation.mutate(treatmentToDelete.id); } }}
            />

            <PatientPhotoPreviewDialog
                key={previewGallery ? `${previewGallery.startIndex}:${previewGallery.images.map((image) => image.src).join('|')}` : 'closed-history-gallery'}
                open={previewGallery !== null}
                onOpenChange={(open) => !open && setPreviewGallery(null)}
                images={previewGallery?.images ?? []}
                startIndex={previewGallery?.startIndex ?? 0}
                src={previewGallery?.images[0]?.src ?? null}
                alt={previewGallery?.images[0]?.alt ?? ''}
                title={previewGallery?.images[0]?.title ?? previewGallery?.fallbackTitle ?? patientName}
            />
        </>
    );
}

