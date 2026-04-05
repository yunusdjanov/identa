'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createPatientTreatment,
    deletePatientTreatment,
    deletePatientTreatmentImage,
    listAllPatientTreatments,
    updatePatientTreatment,
    uploadPatientTreatmentImage,
} from '@/lib/api/dentist';
import type { ApiTreatment } from '@/lib/api/types';
import { getApiErrorMessage } from '@/lib/api/client';
import { useI18n } from '@/components/providers/i18n-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PatientPhotoPreviewDialog } from '@/components/patients/patient-photo-preview-dialog';
import { ClinicalSnapshotCard } from '@/components/patients/clinical-snapshot-card';
import { formatCurrency, formatDate, toLocalDateKey } from '@/lib/utils';
import { toast } from 'sonner';
import { CalendarDays, Image as ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react';

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
    beforeImageFile: File | null;
    afterImageFile: File | null;
    removeBeforeImage: boolean;
    removeAfterImage: boolean;
}

const MAX_HISTORY_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_HISTORY_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
]);

const createEmptyFormState = (): TreatmentFormState => ({
    treatmentDate: toLocalDateKey(),
    treatmentType: '',
    comment: '',
    debtAmount: '',
    paidAmount: '',
    teeth: [],
    beforeImageFile: null,
    afterImageFile: null,
    removeBeforeImage: false,
    removeAfterImage: false,
});

function formatTeeth(teeth: number[]) {
    return teeth.length > 0 ? teeth.join(', ') : '-';
}

function validateHistoryImageFile(file: File | null, t: (key: string, params?: Record<string, string | number>) => string) {
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

export function TreatmentHistoryCard({ patientId, patientName }: TreatmentHistoryCardProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingTreatment, setEditingTreatment] = useState<ApiTreatment | null>(null);
    const [treatmentToDelete, setTreatmentToDelete] = useState<ApiTreatment | null>(null);
    const [previewImage, setPreviewImage] = useState<{ src: string; alt: string; title: string } | null>(null);
    const [formState, setFormState] = useState<TreatmentFormState>(createEmptyFormState);
    const [submitAttempted, setSubmitAttempted] = useState(false);

    const treatmentsQuery = useQuery({
        queryKey: ['patients', 'detail', patientId, 'treatments'],
        queryFn: () => listAllPatientTreatments(patientId, { sort: '-treatment_date,-created_at' }),
        staleTime: 30_000,
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
            const isCreateMode = !editingTreatment;
            let createdTreatmentId: string | null = null;

            try {
                const treatment = editingTreatment
                    ? await updatePatientTreatment(patientId, editingTreatment.id, payload)
                    : await createPatientTreatment(patientId, payload);

                if (isCreateMode) {
                    createdTreatmentId = treatment.id;
                }

                if (editingTreatment?.before_image_url && formState.removeBeforeImage) {
                    await deletePatientTreatmentImage(patientId, treatment.id, 'before');
                }
                if (editingTreatment?.after_image_url && formState.removeAfterImage) {
                    await deletePatientTreatmentImage(patientId, treatment.id, 'after');
                }
                if (formState.beforeImageFile) {
                    await uploadPatientTreatmentImage(patientId, treatment.id, 'before', formState.beforeImageFile);
                }
                if (formState.afterImageFile) {
                    await uploadPatientTreatmentImage(patientId, treatment.id, 'after', formState.afterImageFile);
                }
            }
            catch (error) {
                // Keep create flow atomic from the user perspective:
                // if image upload fails after creating the row, remove that row.
                if (isCreateMode && createdTreatmentId) {
                    try {
                        await deletePatientTreatment(patientId, createdTreatmentId);
                    }
                    catch {
                        // no-op: we still surface the original failure to user
                    }
                }

                throw error;
            }
        },
        onSuccess: () => {
            toast.success(editingTreatment ? t('patientHistory.toast.updated') : t('patientHistory.toast.created'));
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
        onSuccess: () => {
            toast.success(t('patientHistory.toast.deleted'));
            setTreatmentToDelete(null);
            invalidateHistory();
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patientHistory.toast.deleteFailed')));
        },
    });

    const treatmentTypeError = submitAttempted && formState.treatmentType.trim().length < 2 ? t('patientHistory.validation.workDone') : '';
    const dateError = submitAttempted && !formState.treatmentDate ? t('patientHistory.validation.date') : '';
    const amountError =
        submitAttempted && [formState.debtAmount, formState.paidAmount].some((value) => Number(value || 0) < 0)
            ? t('patientHistory.validation.amount')
            : '';
    const beforeImageError = submitAttempted ? validateHistoryImageFile(formState.beforeImageFile, t) : '';
    const afterImageError = submitAttempted ? validateHistoryImageFile(formState.afterImageFile, t) : '';

    const handleSubmit = () => {
        setSubmitAttempted(true);
        if (treatmentTypeError || dateError || amountError || beforeImageError || afterImageError) {
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

    const openEditDialog = (treatment: ApiTreatment) => {
        setEditingTreatment(treatment);
        setFormState({
            treatmentDate: treatment.treatment_date ?? toLocalDateKey(),
            treatmentType: treatment.treatment_type ?? '',
            comment: treatment.comment ?? treatment.description ?? '',
            debtAmount: treatment.debt_amount ? String(Number(treatment.debt_amount)) : '',
            paidAmount: treatment.paid_amount ? String(Number(treatment.paid_amount)) : '',
            teeth: treatment.teeth ?? [],
            beforeImageFile: null,
            afterImageFile: null,
            removeBeforeImage: false,
            removeAfterImage: false,
        });
        setSubmitAttempted(false);
        setIsDialogOpen(true);
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
                            <div className="hidden grid-cols-[120px_110px_minmax(220px,1.6fr)_110px_110px_120px_140px_88px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 lg:grid">
                                <span>{t('patientHistory.table.date')}</span>
                                <span>{t('patientHistory.teethLabel')}</span>
                                <span>{t('patientHistory.table.workDone')}</span>
                                <span>{t('patientHistory.table.debt')}</span>
                                <span>{t('patientHistory.table.paid')}</span>
                                <span>{t('patientHistory.table.balance')}</span>
                                <span>{t('patientHistory.beforeImage')} / {t('patientHistory.afterImage')}</span>
                                <span className="text-right" />
                            </div>
                            <div className="divide-y divide-gray-100">
                                {Array.from({ length: 3 }).map((_, index) => (
                                    <div key={index} className="space-y-3 px-4 py-4 lg:grid lg:grid-cols-[120px_110px_minmax(220px,1.6fr)_110px_110px_120px_140px_88px] lg:items-start lg:gap-3 lg:space-y-0">
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
                            <div className="hidden grid-cols-[120px_110px_minmax(220px,1.6fr)_110px_110px_120px_140px_88px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-500 lg:grid">
                                <span>{t('patientHistory.table.date')}</span>
                                <span>{t('patientHistory.teethLabel')}</span>
                                <span>{t('patientHistory.table.workDone')}</span>
                                <span>{t('patientHistory.table.debt')}</span>
                                <span>{t('patientHistory.table.paid')}</span>
                                <span>{t('patientHistory.table.balance')}</span>
                                <span>{t('patientHistory.beforeImage')} / {t('patientHistory.afterImage')}</span>
                                <span className="text-right" />
                            </div>
                            <div className="divide-y divide-gray-100">
                                {treatments.map((treatment) => (
                                    <div key={treatment.id} className="space-y-3 px-4 py-4 transition-colors hover:bg-gray-50/50 lg:grid lg:grid-cols-[120px_110px_minmax(220px,1.6fr)_110px_110px_120px_140px_88px] lg:items-start lg:gap-3 lg:space-y-0">
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
                                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 lg:hidden">{t('patientHistory.table.balance')}</p>
                                            <p className={`text-sm font-semibold ${Number(treatment.balance) > 0 ? 'text-red-700' : 'text-green-700'}`}>
                                                {formatCurrency(Number(treatment.balance))}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 lg:hidden">{t('patientHistory.beforeImage')} / {t('patientHistory.afterImage')}</p>
                                            <div className="flex flex-wrap gap-2">
                                                {treatment.before_image_url ? (
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-8 w-24 items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
                                                        onClick={() =>
                                                            setPreviewImage({
                                                                src: treatment.before_image_url!,
                                                                alt: `${patientName} ${t('patientHistory.beforeImage')}`,
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
                                                        className="inline-flex h-8 w-24 items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
                                                        onClick={() =>
                                                            setPreviewImage({
                                                                src: treatment.after_image_url!,
                                                                alt: `${patientName} ${t('patientHistory.afterImage')}`,
                                                                title: `${t('patientHistory.afterImage')} - ${formatDate(treatment.treatment_date)}`,
                                                            })
                                                        }
                                                    >
                                                        <ImageIcon className="h-3.5 w-3.5" />
                                                        {t('patientHistory.after')}
                                                    </button>
                                                ) : null}
                                                {!treatment.before_image_url && !treatment.after_image_url ? (
                                                    <span className="inline-flex h-8 w-24 items-center justify-center rounded-full border border-dashed border-gray-200 px-3 text-xs font-medium text-gray-400">
                                                        -
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="flex items-start justify-end gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon-sm"
                                                className="border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-100"
                                                aria-label={t('patientHistory.editEntry')}
                                                onClick={() => openEditDialog(treatment)}
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
                <DialogContent className="w-[min(96vw,1040px)] max-w-[1040px] overflow-x-hidden">
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
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            <div className="rounded-lg border border-gray-200 p-3">
                                <div className="space-y-2">
                                    <Label htmlFor="beforeImage">{t('patientHistory.beforeImage')}</Label>
                                    <Input id="beforeImage" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => setFormState((current) => ({ ...current, beforeImageFile: event.target.files?.[0] ?? null, removeBeforeImage: false }))} />
                                    {(formState.beforeImageFile?.name || (editingTreatment?.before_image_url && !formState.removeBeforeImage)) ? (
                                        <p className="truncate text-xs text-gray-500">{formState.beforeImageFile?.name ?? t('patientHistory.currentImage')}</p>
                                    ) : null}
                                    {beforeImageError ? <p className="text-xs text-red-600">{beforeImageError}</p> : null}
                                    {editingTreatment?.before_image_url && !formState.removeBeforeImage ? <Button type="button" variant="outline" size="sm" onClick={() => setFormState((current) => ({ ...current, beforeImageFile: null, removeBeforeImage: true }))}>{t('patientHistory.removeImage')}</Button> : null}
                                </div>
                            </div>
                            <div className="rounded-lg border border-gray-200 p-3">
                                <div className="space-y-2">
                                    <Label htmlFor="afterImage">{t('patientHistory.afterImage')}</Label>
                                    <Input id="afterImage" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => setFormState((current) => ({ ...current, afterImageFile: event.target.files?.[0] ?? null, removeAfterImage: false }))} />
                                    {(formState.afterImageFile?.name || (editingTreatment?.after_image_url && !formState.removeAfterImage)) ? (
                                        <p className="truncate text-xs text-gray-500">{formState.afterImageFile?.name ?? t('patientHistory.currentImage')}</p>
                                    ) : null}
                                    {afterImageError ? <p className="text-xs text-red-600">{afterImageError}</p> : null}
                                    {editingTreatment?.after_image_url && !formState.removeAfterImage ? <Button type="button" variant="outline" size="sm" onClick={() => setFormState((current) => ({ ...current, afterImageFile: null, removeAfterImage: true }))}>{t('patientHistory.removeImage')}</Button> : null}
                                </div>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saveTreatmentMutation.isPending}>{t('common.cancel')}</Button>
                        <Button type="button" onClick={handleSubmit} disabled={saveTreatmentMutation.isPending}>{saveTreatmentMutation.isPending ? t('common.saving') : t('common.saveChanges')}</Button>
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
                open={previewImage !== null}
                onOpenChange={(open) => !open && setPreviewImage(null)}
                src={previewImage?.src}
                alt={previewImage?.alt ?? ''}
                title={previewImage?.title ?? patientName}
            />
        </>
    );
}

