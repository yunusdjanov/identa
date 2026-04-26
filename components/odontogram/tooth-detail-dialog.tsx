'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { getPatientTreatment } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiTreatment, ApiTreatmentImage } from '@/lib/api/types';
import { getProtectedMediaCrossOrigin } from '@/lib/protected-media';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';
import { PatientPhotoPreviewDialog, type PreviewGalleryImage } from '@/components/patients/patient-photo-preview-dialog';
import { toast } from 'sonner';

interface ToothDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    patientId: string;
    toothNumber: number;
    treatments: ApiTreatment[];
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

function getTreatmentPrimaryImage(treatment: ApiTreatment) {
    if ((treatment.images?.length ?? 0) > 0) {
        return treatment.images[0];
    }

    return treatment.primary_image ?? null;
}

export function ToothDetailDialog({
    open,
    onOpenChange,
    patientId,
    toothNumber,
    treatments,
}: ToothDetailDialogProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [previewGallery, setPreviewGallery] = useState<{
        images: PreviewGalleryImage[];
        startIndex: number;
    } | null>(null);
    const [detailLoadingTreatmentId, setDetailLoadingTreatmentId] = useState<string | null>(null);

    const getLinkedTeeth = (treatment: ApiTreatment): number[] => {
        const linkedTeeth = new Set<number>();

        for (const tooth of treatment.teeth ?? []) {
            if (Number.isFinite(tooth) && tooth >= 1 && tooth <= 32) {
                linkedTeeth.add(tooth);
            }
        }

        if (
            typeof treatment.tooth_number === 'number'
            && Number.isFinite(treatment.tooth_number)
            && treatment.tooth_number >= 1
            && treatment.tooth_number <= 32
        ) {
            linkedTeeth.add(treatment.tooth_number);
        }

        return [...linkedTeeth].sort((a, b) => a - b);
    };

    const summary = useMemo(() => {
        const totalDebt = treatments.reduce((sum, treatment) => sum + Number(treatment.debt_amount ?? 0), 0);
        const totalPaid = treatments.reduce((sum, treatment) => sum + Number(treatment.paid_amount ?? 0), 0);

        return {
            totalDebt,
            totalPaid,
            netBalance: totalDebt - totalPaid,
        };
    }, [treatments]);

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
        if (!open) {
            return;
        }

        const candidates = treatments.filter(
            (treatment) => getTreatmentImageCount(treatment) > 0 && (treatment.images?.length ?? 0) === 0
        );

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
        }, 150);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [open, patientId, queryClient, treatments]);

    const openTreatmentImageGallery = async (treatment: ApiTreatment, startIndex = 0) => {
        setDetailLoadingTreatmentId(treatment.id);

        try {
            const detailedTreatment = await loadTreatmentDetail(treatment);
            const images = detailedTreatment.images ?? [];

            if (images.length === 0) {
                return;
            }

            setPreviewGallery({
                images: images.map((image, index) => ({
                    src: getTreatmentImagePreviewUrl(image),
                    thumbnailSrc: getTreatmentImageThumbnailUrl(image),
                    alt: `${t('patientHistory.image')} ${index + 1} ${formatDate(detailedTreatment.treatment_date)}`,
                    title: `${t('patientHistory.image')} ${index + 1} - ${formatDate(detailedTreatment.treatment_date)}`,
                })),
                startIndex,
            });
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('patientHistory.error.loadFailed')));
        } finally {
            setDetailLoadingTreatmentId((current) => (current === treatment.id ? null : current));
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="h-auto max-h-[calc(100dvh-1.5rem)] w-[min(96vw,1040px)] max-w-[1040px] overflow-x-hidden overflow-y-auto p-5 sm:max-w-[1040px] sm:p-6">
                    <DialogHeader>
                        <DialogTitle>{t('odontogram.toothTitle', { toothNumber })}</DialogTitle>
                        <DialogDescription>{t('patientHistory.subtitle')}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded-xl border border-red-100 bg-red-50/60 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-red-600">{t('patientHistory.table.debt')}</p>
                                <p className="mt-1 whitespace-nowrap text-lg font-semibold tabular-nums text-red-700">{formatCurrency(summary.totalDebt)}</p>
                            </div>
                            <div className="rounded-xl border border-green-100 bg-green-50/60 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-green-600">{t('patientHistory.table.paid')}</p>
                                <p className="mt-1 whitespace-nowrap text-lg font-semibold tabular-nums text-green-700">{formatCurrency(summary.totalPaid)}</p>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-gray-600">{t('patientHistory.table.remaining')}</p>
                                <p
                                    className={`mt-1 whitespace-nowrap text-lg font-semibold tabular-nums ${
                                        summary.netBalance > 0
                                            ? 'text-red-700'
                                            : summary.netBalance < 0
                                                ? 'text-green-700'
                                                : 'text-gray-700'
                                    }`}
                                >
                                    {formatCurrency(summary.netBalance)}
                                </p>
                            </div>
                        </div>

                        {treatments.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center">
                                <p className="text-sm text-gray-500">{t('patientHistory.empty')}</p>
                            </div>
                        ) : (
                            <div className="max-h-[52vh] space-y-2 overflow-x-hidden overflow-y-auto pr-1">
                                {treatments.map((treatment) => {
                                    const linkedTeeth = getLinkedTeeth(treatment);
                                    const treatmentImageCount = getTreatmentImageCount(treatment);
                                    const primaryImage = getTreatmentPrimaryImage(treatment);
                                    const isDetailLoading = detailLoadingTreatmentId === treatment.id;

                                    return (
                                        <div key={treatment.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white px-3 py-3">
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(330px,360px)] sm:items-start sm:gap-4">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-gray-700">{formatDate(treatment.treatment_date)}</p>
                                                    <p
                                                        className="block max-w-[320px] truncate text-sm font-semibold text-gray-900 sm:max-w-[380px] lg:max-w-[460px]"
                                                        title={treatment.treatment_type}
                                                    >
                                                        {treatment.treatment_type}
                                                    </p>
                                                </div>
                                                <div className="grid grid-cols-3 gap-3 text-right text-xs sm:flex-none">
                                                    <div>
                                                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t('patientHistory.table.debt')}</p>
                                                        <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-red-700">{formatCurrency(Number(treatment.debt_amount ?? 0))}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t('patientHistory.table.paid')}</p>
                                                        <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-green-700">{formatCurrency(Number(treatment.paid_amount ?? 0))}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t('patientHistory.table.remaining')}</p>
                                                        <p
                                                            className={`whitespace-nowrap text-sm font-semibold tabular-nums ${
                                                                Number(treatment.balance ?? 0) > 0
                                                                    ? 'text-red-700'
                                                                    : Number(treatment.balance ?? 0) < 0
                                                                        ? 'text-green-700'
                                                                        : 'text-gray-700'
                                                            }`}
                                                        >
                                                            {formatCurrency(Number(treatment.balance ?? 0))}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                {linkedTeeth.slice(0, 1).map((tooth) => (
                                                    <Badge key={`${treatment.id}-${tooth}`} variant="outline" className="border-gray-300 bg-gray-50 text-gray-700">
                                                        #{tooth}
                                                    </Badge>
                                                ))}
                                                {linkedTeeth.length > 1 ? (
                                                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                                                        +{linkedTeeth.length - 1}
                                                    </Badge>
                                                ) : null}
                                                {treatmentImageCount === 0 || !primaryImage ? (
                                                    <span className="inline-flex h-8 min-w-[74px] items-center justify-center rounded-md border border-dashed border-gray-300 px-2 text-xs font-medium text-gray-400">
                                                        -
                                                    </span>
                                                ) : (
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
                                                                alt={`${t('patientHistory.image')} 1`}
                                                                crossOrigin={getProtectedMediaCrossOrigin(getTreatmentImageThumbnailUrl(primaryImage))}
                                                                className="h-full w-full object-cover"
                                                                loading="lazy"
                                                            />
                                                        </span>
                                                        <span className="inline-flex h-5 min-w-6 items-center justify-center rounded-[6px] bg-blue-100 px-1.5 text-[11px] font-semibold text-blue-700">
                                                            +{treatmentImageCount}
                                                        </span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                </DialogContent>
            </Dialog>

            <PatientPhotoPreviewDialog
                key={previewGallery ? `${previewGallery.startIndex}:${previewGallery.images.map((image) => image.src).join('|')}` : 'closed-tooth-gallery'}
                open={previewGallery !== null}
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        setPreviewGallery(null);
                    }
                }}
                images={previewGallery?.images ?? []}
                startIndex={previewGallery?.startIndex ?? 0}
                src={previewGallery?.images[0]?.src ?? null}
                alt={previewGallery?.images[0]?.alt ?? ''}
                title={previewGallery?.images[0]?.title ?? t('odontogram.imagePreview')}
            />
        </>
    );
}
