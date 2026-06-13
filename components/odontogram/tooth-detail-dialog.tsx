'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { getBalanceMetricTone, MetricSummaryCard } from '@/components/ui/metric-summary-card';
import { getCurrentUser, getPatientTreatment } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { canView } from '@/lib/auth/permissions';
import type { ApiTreatment, ApiTreatmentImage } from '@/lib/api/types';
import { getProtectedMediaCrossOrigin, getProtectedMediaPreviewUrl, getProtectedMediaThumbnailUrl, isProtectedMediaApproved } from '@/lib/protected-media';
import { formatToothNumber } from '@/lib/tooth-numbering';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';
import { PatientPhotoPreviewDialog, type PreviewGalleryImage } from '@/components/patients/patient-photo-preview-dialog';
import { toast } from 'sonner';
import { CalendarDays, Loader2, Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface ToothDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    patientId: string;
    toothNumber: number;
    treatments: ApiTreatment[];
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
    // The tooth detail dialog mirrors the treatment-history-card's gating:
    // a viewer without payments.view sees clinical context (date, work,
    // teeth, images) but no money. The dialog is opened from BOTH the
    // clinical-snapshot card and the dedicated odontogram page, so we read
    // permissions here instead of forcing every caller to thread a prop —
    // the dialog should never expose financials regardless of where it
    // launches from.
    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 30_000,
    });
    const canViewFinancials = canView(currentUserQuery.data, 'payments');
    const toothLabel = formatToothNumber(toothNumber);

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

    const openTreatmentImageGallery = async (treatment: ApiTreatment, startIndex = 0) => {
        setDetailLoadingTreatmentId(treatment.id);

        try {
            const detailedTreatment = await loadTreatmentDetail(treatment);
            const images = (detailedTreatment.images ?? []).filter((image) => getTreatmentImagePreviewUrl(image));

            if (images.length === 0) {
                return;
            }

            setPreviewGallery({
                images: images.map((image, index) => ({
                    src: getTreatmentImagePreviewUrl(image) ?? '',
                    thumbnailSrc: getTreatmentImageThumbnailUrl(image) ?? undefined,
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
                        <DialogTitle>{t('odontogram.toothTitle', { toothNumber: toothLabel })}</DialogTitle>
                        <DialogDescription>{t('patientHistory.subtitle')}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Locked-state preserves the 3-card grid for viewers
                            without payments.view so the dialog shape stays
                            consistent — see MetricSummaryCard `locked` prop. */}
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <MetricSummaryCard
                                label={t('patientHistory.table.debt')}
                                value={formatCurrency(summary.totalDebt)}
                                tone="red"
                                tabular
                                locked={!canViewFinancials}
                            />
                            <MetricSummaryCard
                                label={t('patientHistory.table.paid')}
                                value={formatCurrency(summary.totalPaid)}
                                tone="emerald"
                                tabular
                                locked={!canViewFinancials}
                            />
                            <MetricSummaryCard
                                label={t('patientHistory.table.remaining')}
                                value={formatCurrency(summary.netBalance)}
                                tone={getBalanceMetricTone(summary.netBalance)}
                                tabular
                                locked={!canViewFinancials}
                            />
                        </div>

                        {treatments.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-200">
                                <EmptyState icon={CalendarDays} title={t('patientHistory.empty')} size="sm" />
                            </div>
                        ) : (
                            <div className="max-h-[52vh] space-y-2 overflow-x-hidden overflow-y-auto pr-1">
                                {treatments.map((treatment) => {
                                    const linkedTeeth = getLinkedTeeth(treatment);
                                    const treatmentImageCount = getTreatmentImageCount(treatment);
                                    const primaryImage = getTreatmentPrimaryImage(treatment);
                                    const isDetailLoading = detailLoadingTreatmentId === treatment.id;
                                    const primaryImageThumbnailUrl = primaryImage ? getTreatmentImageThumbnailUrl(primaryImage) : null;
                                    const hasApprovedPrimaryImage = primaryImage ? isProtectedMediaApproved(primaryImage.scan_status) : false;

                                    return (
                                        <div key={treatment.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-3">
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(330px,360px)] sm:items-start sm:gap-4">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-slate-700">{formatDate(treatment.treatment_date)}</p>
                                                    <p
                                                        className="block max-w-[320px] truncate text-sm font-semibold text-slate-900 sm:max-w-[380px] lg:max-w-[460px]"
                                                        title={treatment.treatment_type}
                                                    >
                                                        {treatment.treatment_type}
                                                    </p>
                                                </div>
                                                {/* Per-row financial trio stays in layout regardless
                                                    of permission — viewers without payments.view see
                                                    Lock + "No access" in each cell so the row width
                                                    stays consistent across permission shapes. */}
                                                <div className="grid grid-cols-3 gap-3 text-right text-xs sm:flex-none">
                                                    <div>
                                                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('patientHistory.table.debt')}</p>
                                                        {canViewFinancials ? (
                                                            <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-red-700">{formatCurrency(Number(treatment.debt_amount ?? 0))}</p>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-300" aria-label={t('dashboard.lockedKpi.label')}>
                                                                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                                                <span className="truncate">{t('dashboard.lockedKpi.label')}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('patientHistory.table.paid')}</p>
                                                        {canViewFinancials ? (
                                                            <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-green-700">{formatCurrency(Number(treatment.paid_amount ?? 0))}</p>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-300" aria-label={t('dashboard.lockedKpi.label')}>
                                                                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                                                <span className="truncate">{t('dashboard.lockedKpi.label')}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{t('patientHistory.table.remaining')}</p>
                                                        {canViewFinancials ? (
                                                            <p
                                                                className={`whitespace-nowrap text-sm font-semibold tabular-nums ${
                                                                    Number(treatment.balance ?? 0) > 0
                                                                        ? 'text-red-700'
                                                                        : Number(treatment.balance ?? 0) < 0
                                                                            ? 'text-green-700'
                                                                            : 'text-slate-700'
                                                                }`}
                                                            >
                                                                {formatCurrency(Number(treatment.balance ?? 0))}
                                                            </p>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-300" aria-label={t('dashboard.lockedKpi.label')}>
                                                                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                                                <span className="truncate">{t('dashboard.lockedKpi.label')}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                {linkedTeeth.slice(0, 1).map((tooth) => (
                                                    <Badge key={`${treatment.id}-${tooth}`} variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                                                        #{formatToothNumber(tooth)}
                                                    </Badge>
                                                ))}
                                                {linkedTeeth.length > 1 ? (
                                                    <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">
                                                        +{linkedTeeth.length - 1}
                                                    </Badge>
                                                ) : null}
                                                {treatmentImageCount > 0 && primaryImage && (!hasApprovedPrimaryImage || !primaryImageThumbnailUrl) ? (
                                                    <span
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700"
                                                        title={t('patientHistory.imagesProcessing')}
                                                        aria-label={t('patientHistory.imagesProcessing')}
                                                    >
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    </span>
                                                ) : treatmentImageCount === 0 || !primaryImage ? (
                                                    <span className="inline-flex h-8 min-w-[74px] items-center justify-center rounded-md border border-dashed border-slate-300 px-2 text-xs font-medium text-slate-400">
                                                        -
                                                    </span>
                                                ) : (
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
                                                                src={primaryImageThumbnailUrl ?? ''}
                                                                alt={`${t('patientHistory.image')} 1`}
                                                                crossOrigin={getProtectedMediaCrossOrigin(primaryImageThumbnailUrl)}
                                                                className="h-full w-full object-cover"
                                                                loading="lazy"
                                                            />
                                                        </span>
                                                        <span className="inline-flex h-5 min-w-6 items-center justify-center rounded-md bg-teal-100 px-1.5 text-[11px] font-semibold text-teal-700">
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
