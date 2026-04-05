'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Image as ImageIcon } from 'lucide-react';
import type { ApiTreatment } from '@/lib/api/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';
import { PatientPhotoPreviewDialog } from '@/components/patients/patient-photo-preview-dialog';

interface ToothDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    toothNumber: number;
    treatments: ApiTreatment[];
}

export function ToothDetailDialog({
    open,
    onOpenChange,
    toothNumber,
    treatments,
}: ToothDetailDialogProps) {
    const { t } = useI18n();
    const [previewImage, setPreviewImage] = useState<{ src: string; alt: string; title: string } | null>(null);
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

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="h-auto max-h-[90vh] w-[min(96vw,980px)] max-w-[980px] overflow-x-hidden overflow-y-auto sm:max-w-[980px]">
                    <DialogHeader>
                        <DialogTitle>{t('odontogram.toothTitle', { toothNumber })}</DialogTitle>
                        <DialogDescription>{t('patientHistory.subtitle')}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="rounded-xl border border-red-100 bg-red-50/60 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-red-600">{t('patientHistory.table.debt')}</p>
                                <p className="mt-1 text-lg font-semibold text-red-700">{formatCurrency(summary.totalDebt)}</p>
                            </div>
                            <div className="rounded-xl border border-green-100 bg-green-50/60 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-green-600">{t('patientHistory.table.paid')}</p>
                                <p className="mt-1 text-lg font-semibold text-green-700">{formatCurrency(summary.totalPaid)}</p>
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                                <p className="text-xs font-medium uppercase tracking-wide text-gray-600">{t('patientHistory.table.balance')}</p>
                                <p
                                    className={`mt-1 text-lg font-semibold ${
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
                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium text-gray-700">{formatDate(treatment.treatment_date)}</p>
                                                <p
                                                    className="block max-w-[320px] truncate text-base font-semibold text-gray-900 sm:max-w-[380px] lg:max-w-[430px]"
                                                    title={treatment.treatment_type}
                                                >
                                                    {treatment.treatment_type}
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2 text-right text-xs sm:min-w-[300px] sm:flex-none">
                                                <div>
                                                    <p className="uppercase tracking-wide text-gray-500">{t('patientHistory.table.debt')}</p>
                                                    <p className="font-semibold text-red-700">{formatCurrency(Number(treatment.debt_amount ?? 0))}</p>
                                                </div>
                                                <div>
                                                    <p className="uppercase tracking-wide text-gray-500">{t('patientHistory.table.paid')}</p>
                                                    <p className="font-semibold text-green-700">{formatCurrency(Number(treatment.paid_amount ?? 0))}</p>
                                                </div>
                                                <div>
                                                    <p className="uppercase tracking-wide text-gray-500">{t('patientHistory.table.balance')}</p>
                                                    <p
                                                        className={`font-semibold ${
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
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
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
                                            {treatment.before_image_url ? (
                                                <button
                                                    type="button"
                                                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
                                                    onClick={() =>
                                                        setPreviewImage({
                                                            src: treatment.before_image_url!,
                                                            alt: `${t('patientHistory.beforeImage')} ${formatDate(treatment.treatment_date)}`,
                                                            title: `${t('patientHistory.beforeImage')} - ${formatDate(treatment.treatment_date)}`,
                                                        })
                                                    }
                                                >
                                                    <ImageIcon className="h-3.5 w-3.5" />
                                                    {t('patientHistory.before')}
                                                </button>
                                            ) : null}
                                            {treatment.after_image_url ? (
                                                <button
                                                    type="button"
                                                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
                                                    onClick={() =>
                                                        setPreviewImage({
                                                            src: treatment.after_image_url!,
                                                            alt: `${t('patientHistory.afterImage')} ${formatDate(treatment.treatment_date)}`,
                                                            title: `${t('patientHistory.afterImage')} - ${formatDate(treatment.treatment_date)}`,
                                                        })
                                                    }
                                                >
                                                    <ImageIcon className="h-3.5 w-3.5" />
                                                    {t('patientHistory.after')}
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                )})}
                            </div>
                        )}
                    </div>

                </DialogContent>
            </Dialog>

            <PatientPhotoPreviewDialog
                open={previewImage !== null}
                onOpenChange={(isOpen) => {
                    if (!isOpen) {
                        setPreviewImage(null);
                    }
                }}
                src={previewImage?.src}
                alt={previewImage?.alt ?? ''}
                title={previewImage?.title ?? t('odontogram.imagePreview')}
            />
        </>
    );
}


