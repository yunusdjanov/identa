'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { ApiTreatment, ApiTreatmentImage } from '@/lib/api/types';
import { getProtectedMediaCrossOrigin } from '@/lib/protected-media';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';
import { PatientPhotoPreviewDialog, type PreviewGalleryImage } from '@/components/patients/patient-photo-preview-dialog';

interface ToothDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    toothNumber: number;
    treatments: ApiTreatment[];
}

function getTreatmentImageThumbnailUrl(image: ApiTreatmentImage) {
    return image.thumbnail_url ?? image.preview_url ?? image.url;
}

function getTreatmentImagePreviewUrl(image: ApiTreatmentImage) {
    return image.preview_url ?? image.url;
}

export function ToothDetailDialog({
    open,
    onOpenChange,
    toothNumber,
    treatments,
}: ToothDetailDialogProps) {
    const { t } = useI18n();
    const [previewGallery, setPreviewGallery] = useState<{
        images: PreviewGalleryImage[];
        startIndex: number;
    } | null>(null);
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

    const openTreatmentImageGallery = (
        images: ApiTreatmentImage[],
        treatmentDate: string,
        startIndex = 0
    ) => {
        if (!images || images.length === 0) {
            return;
        }

        setPreviewGallery({
            images: images.map((image, index) => ({
                src: getTreatmentImagePreviewUrl(image),
                thumbnailSrc: getTreatmentImageThumbnailUrl(image),
                alt: `${t('patientHistory.image')} ${index + 1} ${formatDate(treatmentDate)}`,
                title: `${t('patientHistory.image')} ${index + 1} - ${formatDate(treatmentDate)}`,
            })),
            startIndex,
        });
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="h-auto max-h-[90vh] w-[min(96vw,1040px)] max-w-[1040px] overflow-x-hidden overflow-y-auto sm:max-w-[1040px]">
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
                                            {(() => {
                                                const treatmentImages = treatment.images ?? [];
                                                if (treatmentImages.length === 0) {
                                                    return (
                                                        <span className="inline-flex h-8 min-w-[74px] items-center justify-center rounded-md border border-dashed border-gray-300 px-2 text-xs font-medium text-gray-400">
                                                            -
                                                        </span>
                                                    );
                                                }

                                                return (
                                                    <button
                                                        type="button"
                                                        className="group inline-flex h-8 min-w-[74px] items-center gap-2 rounded-md border border-gray-300 bg-white px-2 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:border-blue-400 hover:bg-blue-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 active:translate-y-px active:shadow-sm"
                                                        onClick={() => openTreatmentImageGallery(treatmentImages, treatment.treatment_date, 0)}
                                                        title={`${t('patientHistory.images')}: ${treatmentImages.length}`}
                                                        aria-label={`${t('patientHistory.images')} (${treatmentImages.length})`}
                                                    >
                                                        <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-[6px] border border-gray-200 bg-gray-100">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img
                                                                src={getTreatmentImageThumbnailUrl(treatmentImages[0])}
                                                                alt={`${t('patientHistory.image')} 1`}
                                                                crossOrigin={getProtectedMediaCrossOrigin(getTreatmentImageThumbnailUrl(treatmentImages[0]))}
                                                                className="h-full w-full object-cover"
                                                                loading="lazy"
                                                            />
                                                        </span>
                                                        <span className="inline-flex h-5 min-w-6 items-center justify-center rounded-[6px] bg-blue-100 px-1.5 text-[11px] font-semibold text-blue-700">
                                                            +{treatmentImages.length}
                                                        </span>
                                                    </button>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )})}
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


