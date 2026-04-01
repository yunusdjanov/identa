'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
    createPatientOdontogramEntry,
    createPatientTreatment,
    deletePatientOdontogramEntry,
    deletePatientOdontogramEntryImage,
    downloadPatientOdontogramEntryImage,
    updatePatientOdontogramEntry,
    uploadPatientOdontogramEntryImage,
} from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiOdontogramEntry, ApiOdontogramEntryImage } from '@/lib/api/types';
import { formatDate, getToothConditionColor, toLocalDateKey } from '@/lib/utils';
import { ChevronDown, ChevronUp, Image as ImageIcon, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { useI18n } from '@/components/providers/i18n-provider';

interface ToothDetailDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    patientId: string;
    toothNumber: number;
    entries: ApiOdontogramEntry[];
    onCreated?: () => void;
}

interface NewConditionState {
    type: ApiOdontogramEntry['condition_type'];
    material: string;
}

interface EditConditionState {
    id: string;
    type: ApiOdontogramEntry['condition_type'];
    material: string;
    conditionDate: string;
}

interface BillingState {
    enabled: boolean;
    amount: string;
    paidAmount: string;
    description: string;
}

const initialState: NewConditionState = {
    type: 'cavity',
    material: '',
};

function conditionSupportsMaterial(type: ApiOdontogramEntry['condition_type']): boolean {
    return type === 'filling' || type === 'crown' || type === 'implant';
}

function createInitialBillingState(): BillingState {
    return {
        enabled: false,
        amount: '',
        paidAmount: '',
        description: '',
    };
}

function buildEditState(entry: ApiOdontogramEntry): EditConditionState {
    return {
        id: entry.id,
        type: entry.condition_type,
        material: conditionSupportsMaterial(entry.condition_type) ? (entry.material ?? '') : '',
        conditionDate: entry.condition_date,
    };
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== 'string') {
                reject(new Error('Failed to parse image content.'));
                return;
            }
            resolve(reader.result);
        };
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(blob);
    });
}

function EntryImageThumbnail({
    patientId,
    entryId,
    image,
    onPreview,
}: {
    patientId: string;
    entryId: string;
    image: ApiOdontogramEntryImage;
    onPreview: (payload: { title: string; url: string }) => void;
}) {
    const { t } = useI18n();
    const imageQuery = useQuery({
        queryKey: ['patients', 'odontogram', 'image', patientId, entryId, image.id],
        queryFn: async () => {
            const blob = await downloadPatientOdontogramEntryImage(patientId, entryId, image.id);
            return blobToDataUrl(blob);
        },
        staleTime: 5 * 60 * 1000,
    });

    if (imageQuery.isLoading) {
        return (
            <div className="h-24 w-full rounded-md border border-dashed border-gray-300 bg-gray-50" />
        );
    }

    if (imageQuery.isError || !imageQuery.data) {
        return (
            <p className="text-xs text-red-600">{t('odontogram.error.imageLoadFailed')}</p>
        );
    }

    return (
        <button
            type="button"
            onClick={() => onPreview({
                title: image.stage === 'before'
                    ? t('odontogram.image.beforeTitle')
                    : t('odontogram.image.afterTitle'),
                url: imageQuery.data,
            })}
            className="group relative block h-24 w-full overflow-hidden rounded-md border border-gray-200 bg-white"
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imageQuery.data}
                alt={
                    image.stage === 'before'
                        ? t('odontogram.image.beforeAlt')
                        : t('odontogram.image.afterAlt')
                }
                className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
        </button>
    );
}

export function ToothDetailDialog({
    open,
    onOpenChange,
    patientId,
    toothNumber,
    entries,
    onCreated,
}: ToothDetailDialogProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const [isAddingCondition, setIsAddingCondition] = useState(false);
    const [newCondition, setNewCondition] = useState<NewConditionState>(initialState);
    const [billing, setBilling] = useState<BillingState>(() => createInitialBillingState());
    const [editingEntry, setEditingEntry] = useState<EditConditionState | null>(null);
    const [entryToDelete, setEntryToDelete] = useState<ApiOdontogramEntry | null>(null);
    const [previewImage, setPreviewImage] = useState<{ title: string; url: string } | null>(null);
    const [imageToDelete, setImageToDelete] = useState<{
        entryId: string;
        imageId: string;
        stage: 'before' | 'after';
    } | null>(null);
    const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

    const closeAddConditionPanel = () => {
        setIsAddingCondition(false);
        setNewCondition(initialState);
        setBilling(createInitialBillingState());
    };

    const sortedEntries = useMemo(
        () =>
            [...entries].sort((a, b) => {
                const left = `${a.condition_date}-${a.created_at ?? ''}`;
                const right = `${b.condition_date}-${b.created_at ?? ''}`;
                return right.localeCompare(left);
            }),
        [entries]
    );

    const latestCondition = sortedEntries[0];
    const shouldShowMaterialField = conditionSupportsMaterial(newCondition.type);

    const formatConditionLabel = (value: ApiOdontogramEntry['condition_type']) => {
        if (value === 'healthy') {
            return t('odontogram.condition.healthy');
        }
        if (value === 'cavity') {
            return t('odontogram.condition.cavity');
        }
        if (value === 'filling') {
            return t('odontogram.condition.filling');
        }
        if (value === 'crown') {
            return t('odontogram.condition.crown');
        }
        if (value === 'root_canal') {
            return t('odontogram.condition.rootCanal');
        }
        if (value === 'extraction') {
            return t('odontogram.condition.extraction');
        }

        return t('odontogram.condition.implant');
    };

    const formatMaterialLabel = (value: string) => {
        if (value === 'composite') {
            return t('odontogram.material.composite');
        }
        if (value === 'amalgam') {
            return t('odontogram.material.amalgam');
        }
        if (value === 'porcelain') {
            return t('odontogram.material.porcelain');
        }
        if (value === 'gold') {
            return t('odontogram.material.gold');
        }
        if (value === 'ceramic') {
            return t('odontogram.material.ceramic');
        }
        if (value === 'other') {
            return t('odontogram.material.other');
        }

        return value;
    };

    const invalidateOdontogramViews = () => {
        queryClient.invalidateQueries({ queryKey: ['patients', 'odontogram', patientId] });
        queryClient.invalidateQueries({ queryKey: ['patients', 'odontogram', 'summary', patientId] });
        onCreated?.();
    };

    const createMutation = useMutation({
        mutationFn: async () => {
            await createPatientOdontogramEntry(patientId, {
                tooth_number: toothNumber,
                condition_type: newCondition.type,
                material: newCondition.material || undefined,
                condition_date: toLocalDateKey(),
            });

            if (!billing.enabled) {
                return {
                    historyCreated: false,
                    historyError: null as string | null,
                };
            }

            const amountValue = Number(billing.amount);
            const paidAmountValue = Number(billing.paidAmount || 0);
            const treatmentType =
                billing.description.trim()
                || t('odontogram.defaultHistoryWorkDone', {
                    toothNumber,
                    condition: formatConditionLabel(newCondition.type).toLowerCase(),
                });

            try {
                await createPatientTreatment(patientId, {
                    treatment_date: toLocalDateKey(),
                    treatment_type: treatmentType,
                    comment: t('odontogram.historyComment', {
                        toothNumber,
                        condition: formatConditionLabel(newCondition.type),
                    }),
                    teeth: [toothNumber],
                    tooth_number: toothNumber,
                    debt_amount: amountValue,
                    paid_amount: paidAmountValue,
                });
                return {
                    historyCreated: true,
                    historyError: null as string | null,
                };
            } catch (error) {
                return {
                    historyCreated: false,
                    historyError: getApiErrorMessage(error, t('odontogram.error.historyEntryCreateFailed')),
                };
            }
        },
        onSuccess: (result) => {
            if (result.historyCreated) {
                toast.success(t('odontogram.toast.savedWithHistory'));
                queryClient.invalidateQueries({ queryKey: ['patients', 'detail', patientId, 'treatments'] });
                queryClient.invalidateQueries({ queryKey: ['payments'] });
                queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            } else {
                toast.success(t('odontogram.toast.savedConditionOnly'));
                if (result.historyError) {
                    toast.error(t('odontogram.toast.savedHistoryFailed', { error: result.historyError }));
                }
            }

            setIsAddingCondition(false);
            setNewCondition(initialState);
            setBilling(createInitialBillingState());
            invalidateOdontogramViews();
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('odontogram.error.saveConditionFailed')));
        },
    });

    const updateMutation = useMutation({
        mutationFn: async (payload: EditConditionState) =>
            updatePatientOdontogramEntry(patientId, payload.id, {
                tooth_number: toothNumber,
                condition_type: payload.type,
                material: conditionSupportsMaterial(payload.type) ? (payload.material || undefined) : undefined,
                condition_date: payload.conditionDate,
            }),
        onSuccess: () => {
            toast.success(t('odontogram.toast.historyUpdated'));
            setEditingEntry(null);
            invalidateOdontogramViews();
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('odontogram.error.historyUpdateFailed')));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (entryId: string) => deletePatientOdontogramEntry(patientId, entryId),
        onSuccess: () => {
            toast.success(t('odontogram.toast.historyDeleted'));
            setEntryToDelete(null);
            invalidateOdontogramViews();
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('odontogram.error.historyDeleteFailed')));
        },
    });

    const uploadImageMutation = useMutation({
        mutationFn: async (payload: {
            entryId: string;
            stage: 'before' | 'after';
            file: File;
            capturedAt?: string;
        }) =>
            uploadPatientOdontogramEntryImage(patientId, payload.entryId, {
                stage: payload.stage,
                image: payload.file,
                captured_at: payload.capturedAt,
            }),
        onSuccess: () => {
            toast.success(t('odontogram.toast.imageUploaded'));
            invalidateOdontogramViews();
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('odontogram.error.imageUploadFailed')));
        },
    });

    const deleteImageMutation = useMutation({
        mutationFn: async (payload: { entryId: string; imageId: string }) =>
            deletePatientOdontogramEntryImage(patientId, payload.entryId, payload.imageId),
        onSuccess: () => {
            toast.success(t('odontogram.toast.imageDeleted'));
            setImageToDelete(null);
            invalidateOdontogramViews();
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('odontogram.error.imageDeleteFailed')));
        },
    });

    const handleCreateCondition = () => {
        if (billing.enabled) {
            const amountValue = Number(billing.amount);
            if (!Number.isFinite(amountValue) || amountValue <= 0) {
                toast.error(t('odontogram.error.historyDebtAmountMin'));
                return;
            }

            const paidAmountValue = Number(billing.paidAmount || 0);
            if (!Number.isFinite(paidAmountValue) || paidAmountValue < 0) {
                toast.error(t('odontogram.error.paidAmountNegative'));
                return;
            }

            if (paidAmountValue > amountValue) {
                toast.error(t('odontogram.error.paidAmountExceeds'));
                return;
            }
        }

        createMutation.mutate();
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t('odontogram.toothTitle', { toothNumber })}</DialogTitle>
                        <DialogDescription>
                            {t('odontogram.toothDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-6">
                        <div>
                            <h3 className="font-medium text-sm text-gray-900 mb-2">{t('odontogram.currentStatus')}</h3>
                            {latestCondition ? (
                                <div className="flex items-center space-x-2">
                                    <Badge className={getToothConditionColor(latestCondition.condition_type)}>
                                        {formatConditionLabel(latestCondition.condition_type).toUpperCase()}
                                    </Badge>
                                    <span className="text-sm text-gray-500">
                                        {t('odontogram.lastUpdated', { date: formatDate(latestCondition.condition_date) })}
                                    </span>
                                </div>
                            ) : (
                                <Badge className="bg-gray-100 border-gray-300 text-gray-800">{t('odontogram.condition.healthy').toUpperCase()}</Badge>
                            )}
                        </div>

                        <div className="order-3">
                            <h3 className="font-medium text-sm text-gray-900 mb-3">{t('odontogram.conditionHistory')}</h3>
                            {sortedEntries.length === 0 ? (
                                <p className="text-sm text-gray-400">{t('odontogram.noHistory')}</p>
                            ) : (
                                <div className="space-y-3">
                                    {sortedEntries.map((entry) => {
                                        const beforeImage = entry.images?.find((image) => image.stage === 'before');
                                        const afterImage = entry.images?.find((image) => image.stage === 'after');
                                        const isEditingThisEntry = editingEntry?.id === entry.id;
                                        const isExpanded = expandedEntryId === entry.id || isEditingThisEntry;

                                        return (
                                            <div key={entry.id} className="rounded-lg border border-gray-200 p-3">
                                                <div className="mb-2 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Badge
                                                            variant="secondary"
                                                            className={getToothConditionColor(entry.condition_type)}
                                                        >
                                                            {formatConditionLabel(entry.condition_type).toUpperCase()}
                                                        </Badge>
                                                        <span className="text-xs text-gray-500">
                                                            {formatDate(entry.condition_date)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            size="xs"
                                                            variant="ghost"
                                                            onClick={() => {
                                                                closeAddConditionPanel();

                                                                if (isEditingThisEntry) {
                                                                    setEditingEntry(null);
                                                                    setExpandedEntryId(null);
                                                                    return;
                                                                }

                                                                setExpandedEntryId((current) =>
                                                                    current === entry.id ? null : entry.id
                                                                );
                                                            }}
                                                        >
                                                            {isExpanded ? (
                                                                <ChevronUp className="h-3 w-3" />
                                                            ) : (
                                                                <ChevronDown className="h-3 w-3" />
                                                            )}
                                                            {isExpanded ? t('odontogram.collapse') : t('odontogram.details')}
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="xs"
                                                            variant="outline"
                                                            onClick={() => {
                                                                closeAddConditionPanel();

                                                                if (isEditingThisEntry) {
                                                                    setEditingEntry(null);
                                                                    setExpandedEntryId(entry.id);
                                                                    return;
                                                                }
                                                                setExpandedEntryId(entry.id);
                                                                setEditingEntry(buildEditState(entry));
                                                            }}
                                                            disabled={deleteMutation.isPending || updateMutation.isPending}
                                                        >
                                                            <Pencil className="h-3 w-3" />
                                                            {t('payments.edit')}
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            size="xs"
                                                            variant="destructive"
                                                            onClick={() => setEntryToDelete(entry)}
                                                            disabled={deleteMutation.isPending || updateMutation.isPending}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                            {t('payments.delete')}
                                                        </Button>
                                                    </div>
                                                </div>

                                                {isExpanded ? (
                                                    isEditingThisEntry && editingEntry ? (
                                                    <div className="mb-3 space-y-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                            <div className="space-y-2">
                                                                <Label>{t('odontogram.conditionType')}</Label>
                                                                <Select
                                                                    value={editingEntry.type}
                                                                    onValueChange={(value) =>
                                                                        setEditingEntry({
                                                                            ...editingEntry,
                                                                            type: value as ApiOdontogramEntry['condition_type'],
                                                                            material: conditionSupportsMaterial(value as ApiOdontogramEntry['condition_type'])
                                                                                ? editingEntry.material
                                                                                : '',
                                                                        })}
                                                                >
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="healthy">{t('odontogram.condition.healthy')}</SelectItem>
                                                                        <SelectItem value="cavity">{t('odontogram.condition.cavity')}</SelectItem>
                                                                        <SelectItem value="filling">{t('odontogram.condition.filling')}</SelectItem>
                                                                        <SelectItem value="crown">{t('odontogram.condition.crown')}</SelectItem>
                                                                        <SelectItem value="root_canal">{t('odontogram.condition.rootCanal')}</SelectItem>
                                                                        <SelectItem value="extraction">{t('odontogram.condition.extraction')}</SelectItem>
                                                                        <SelectItem value="implant">{t('odontogram.condition.implant')}</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <Label>{t('odontogram.conditionDate')}</Label>
                                                                <Input
                                                                    type="date"
                                                                    value={editingEntry.conditionDate}
                                                                    onChange={(event) =>
                                                                        setEditingEntry({
                                                                            ...editingEntry,
                                                                            conditionDate: event.target.value,
                                                                        })}
                                                                />
                                                            </div>
                                                        </div>
                                                        {conditionSupportsMaterial(editingEntry.type) ? (
                                                            <div className="space-y-2">
                                                                <Label>{t('odontogram.material')}</Label>
                                                                <Select
                                                                    value={editingEntry.material || 'none'}
                                                                    onValueChange={(value) =>
                                                                        setEditingEntry({
                                                                            ...editingEntry,
                                                                            material: value === 'none' ? '' : value,
                                                                        })}
                                                                >
                                                                    <SelectTrigger className="w-full">
                                                                        <SelectValue placeholder={t('odontogram.materialSelect')} />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="none">{t('odontogram.materialNotSpecified')}</SelectItem>
                                                                        <SelectItem value="composite">{t('odontogram.material.composite')}</SelectItem>
                                                                        <SelectItem value="amalgam">{t('odontogram.material.amalgam')}</SelectItem>
                                                                        <SelectItem value="porcelain">{t('odontogram.material.porcelain')}</SelectItem>
                                                                        <SelectItem value="gold">{t('odontogram.material.gold')}</SelectItem>
                                                                        <SelectItem value="ceramic">{t('odontogram.material.ceramic')}</SelectItem>
                                                                        <SelectItem value="other">{t('odontogram.material.other')}</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        ) : null}
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                type="button"
                                                                size="xs"
                                                                variant="outline"
                                                                onClick={() => setEditingEntry(null)}
                                                                disabled={updateMutation.isPending}
                                                            >
                                                                {t('common.cancel')}
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                size="xs"
                                                                onClick={() => {
                                                                    if (!editingEntry.conditionDate) {
                                                                        toast.error(t('odontogram.error.conditionDateRequired'));
                                                                        return;
                                                                    }
                                                                    updateMutation.mutate(editingEntry);
                                                                }}
                                                                disabled={updateMutation.isPending}
                                                            >
                                                                {updateMutation.isPending ? t('common.saving') : t('common.saveChanges')}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    ) : (
                                                    <>
                                                        {conditionSupportsMaterial(entry.condition_type) && entry.material ? (
                                                            <p className="text-xs text-gray-600">
                                                                {t('odontogram.materialValue', { material: formatMaterialLabel(entry.material) })}
                                                            </p>
                                                        ) : null}
                                                    </>
                                                    )
                                                ) : null}

                                                {isExpanded ? (
                                                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                    {(['before', 'after'] as const).map((stage) => {
                                                        const image = stage === 'before' ? beforeImage : afterImage;
                                                        const inputId = `odontogram-image-${entry.id}-${stage}`;
                                                        const fileRefKey = `${entry.id}-${stage}`;

                                                        return (
                                                            <div key={stage} className="rounded-md border border-gray-200 p-2">
                                                                <div className="mb-2 flex items-center justify-between">
                                                                    <span className="text-xs font-medium uppercase tracking-wide text-gray-600">
                                                                        {stage === 'before' ? t('odontogram.stage.before') : t('odontogram.stage.after')}
                                                                    </span>
                                                                    {image ? (
                                                                        <span className="text-[11px] text-gray-500">
                                                                            {Math.round(image.file_size / 1024)} KB
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                                {image ? (
                                                                    <EntryImageThumbnail
                                                                        patientId={patientId}
                                                                        entryId={entry.id}
                                                                        image={image}
                                                                        onPreview={(payload) => setPreviewImage(payload)}
                                                                    />
                                                                ) : (
                                                                    <div className="flex h-24 w-full items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500">
                                                                        <ImageIcon className="mr-1 h-3.5 w-3.5" />
                                                                        {t('odontogram.image.none')}
                                                                    </div>
                                                                )}
                                                                <div className="mt-2 flex items-center gap-2">
                                                                    <Button
                                                                        type="button"
                                                                        size="xs"
                                                                        variant="outline"
                                                                        onClick={() => fileInputRefs.current[fileRefKey]?.click()}
                                                                        disabled={uploadImageMutation.isPending}
                                                                    >
                                                                        <Upload className="h-3 w-3" />
                                                                        {image ? t('odontogram.image.replace') : t('odontogram.image.upload')}
                                                                    </Button>
                                                                    {image ? (
                                                                        <Button
                                                                            type="button"
                                                                            size="xs"
                                                                            variant="destructive"
                                                                            onClick={() =>
                                                                                setImageToDelete({
                                                                                    entryId: entry.id,
                                                                                    imageId: image.id,
                                                                                    stage,
                                                                                })}
                                                                            disabled={deleteImageMutation.isPending}
                                                                        >
                                                                            {t('odontogram.image.remove')}
                                                                        </Button>
                                                                    ) : null}
                                                                </div>
                                                                <Input
                                                                    id={inputId}
                                                                    type="file"
                                                                    accept="image/jpeg,image/png,image/webp"
                                                                    className="hidden"
                                                                    ref={(node) => {
                                                                        fileInputRefs.current[fileRefKey] = node;
                                                                    }}
                                                                    onChange={(event) => {
                                                                        const file = event.target.files?.[0];
                                                                        if (!file) {
                                                                            return;
                                                                        }

                                                                        uploadImageMutation.mutate({
                                                                            entryId: entry.id,
                                                                            stage,
                                                                            file,
                                                                            capturedAt: entry.condition_date,
                                                                        });
                                                                        event.target.value = '';
                                                                    }}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="order-2">
                            {!isAddingCondition ? (
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => {
                                        setExpandedEntryId(null);
                                        setEditingEntry(null);
                                        setIsAddingCondition(true);
                                    }}
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    {t('odontogram.addNewCondition')}
                                </Button>
                            ) : (
                                <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                                    <h3 className="font-medium text-sm text-gray-900">{t('odontogram.addNewCondition')}</h3>

                                <div className={`grid grid-cols-1 gap-3 ${shouldShowMaterialField ? 'sm:grid-cols-2' : ''}`}>
                                    <div className="space-y-2">
                                        <Label htmlFor="conditionType">{t('odontogram.conditionType')}</Label>
                                        <Select
                                            value={newCondition.type}
                                            onValueChange={(value) =>
                                                setNewCondition({
                                                    ...newCondition,
                                                    type: value as ApiOdontogramEntry['condition_type'],
                                                    material: conditionSupportsMaterial(value as ApiOdontogramEntry['condition_type'])
                                                        ? newCondition.material
                                                        : '',
                                                })}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="healthy">{t('odontogram.condition.healthy')}</SelectItem>
                                                <SelectItem value="cavity">{t('odontogram.condition.cavity')}</SelectItem>
                                                <SelectItem value="filling">{t('odontogram.condition.filling')}</SelectItem>
                                                <SelectItem value="crown">{t('odontogram.condition.crown')}</SelectItem>
                                                <SelectItem value="root_canal">{t('odontogram.condition.rootCanal')}</SelectItem>
                                                <SelectItem value="extraction">{t('odontogram.condition.extraction')}</SelectItem>
                                                <SelectItem value="implant">{t('odontogram.condition.implant')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {shouldShowMaterialField ? (
                                        <div className="space-y-2">
                                            <Label htmlFor="material">{t('odontogram.material')}</Label>
                                            <Select
                                                value={newCondition.material || 'none'}
                                                onValueChange={(value) =>
                                                    setNewCondition({
                                                        ...newCondition,
                                                        material: value === 'none' ? '' : value,
                                                    })}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder={t('odontogram.materialSelect')} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">{t('odontogram.materialNotSpecified')}</SelectItem>
                                                    <SelectItem value="composite">{t('odontogram.material.composite')}</SelectItem>
                                                    <SelectItem value="amalgam">{t('odontogram.material.amalgam')}</SelectItem>
                                                    <SelectItem value="porcelain">{t('odontogram.material.porcelain')}</SelectItem>
                                                    <SelectItem value="gold">{t('odontogram.material.gold')}</SelectItem>
                                                    <SelectItem value="ceramic">{t('odontogram.material.ceramic')}</SelectItem>
                                                    <SelectItem value="other">{t('odontogram.material.other')}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    ) : null}
                                </div>

                                <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300"
                                            checked={billing.enabled}
                                            onChange={(event) =>
                                                setBilling({
                                                    ...billing,
                                                    enabled: event.target.checked,
                                                })}
                                        />
                                        {t('odontogram.addHistoryEntry')}
                                    </label>

                                    {billing.enabled ? (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                <div className="space-y-2">
                                                    <Label htmlFor="billingAmount">{t('patientHistory.table.debt')}</Label>
                                                    <Input
                                                        id="billingAmount"
                                                        type="number"
                                                        min="1"
                                                        step="0.01"
                                                        value={billing.amount}
                                                        onChange={(event) =>
                                                            setBilling({
                                                                ...billing,
                                                                amount: event.target.value,
                                                            })}
                                                        placeholder={t('odontogram.amountPlaceholder')}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="billingPaidAmount">{t('patientHistory.table.paid')}</Label>
                                                    <Input
                                                        id="billingPaidAmount"
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={billing.paidAmount}
                                                        onChange={(event) =>
                                                            setBilling({
                                                                ...billing,
                                                                paidAmount: event.target.value,
                                                            })}
                                                        placeholder={t('payments.form.amountPlaceholder')}
                                                    />
                                                    <p className="text-xs text-gray-500">
                                                        {t('odontogram.paidNowHint')}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <Label htmlFor="billingDescription">{t('patientHistory.table.workDone')}</Label>
                                                <Input
                                                    id="billingDescription"
                                                    value={billing.description}
                                                    onChange={(event) =>
                                                        setBilling({
                                                            ...billing,
                                                            description: event.target.value,
                                                        })}
                                                    placeholder={t('odontogram.defaultHistoryWorkDone', {
                                                        toothNumber,
                                                        condition: formatConditionLabel(newCondition.type).toLowerCase(),
                                                    })}
                                                />
                                            </div>

                                        </div>
                                    ) : null}
                                </div>

                                    <div className="flex space-x-2">
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                setIsAddingCondition(false);
                                                setBilling(createInitialBillingState());
                                            }}
                                            className="flex-1"
                                            disabled={createMutation.isPending}
                                        >
                                            {t('common.cancel')}
                                        </Button>
                                        <Button onClick={handleCreateCondition} className="flex-1" disabled={createMutation.isPending}>
                                            {createMutation.isPending ? t('common.saving') : t('odontogram.addCondition')}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            {t('odontogram.close')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmActionDialog
                open={Boolean(entryToDelete)}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setEntryToDelete(null);
                    }
                }}
                title={t('odontogram.deleteHistoryTitle')}
                description={
                    entryToDelete
                        ? t('odontogram.deleteHistoryDescription', {
                            condition: formatConditionLabel(entryToDelete.condition_type).toLowerCase(),
                            date: formatDate(entryToDelete.condition_date),
                        })
                        : t('payments.deleteFallback')
                }
                disabled={!entryToDelete}
                isPending={deleteMutation.isPending}
                confirmLabel={t('payments.confirmDelete')}
                pendingLabel={t('payments.deleting')}
                onConfirm={() => {
                    if (!entryToDelete) {
                        return;
                    }
                    deleteMutation.mutate(entryToDelete.id);
                }}
            />

            <ConfirmActionDialog
                open={Boolean(imageToDelete)}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        setImageToDelete(null);
                    }
                }}
                title={t('odontogram.removeImageTitle')}
                description={
                    imageToDelete
                        ? t('odontogram.removeImageDescription', {
                            stage: imageToDelete.stage === 'before'
                                ? t('odontogram.stage.before').toLowerCase()
                                : t('odontogram.stage.after').toLowerCase(),
                        })
                        : t('payments.deleteFallback')
                }
                disabled={!imageToDelete}
                isPending={deleteImageMutation.isPending}
                confirmLabel={t('odontogram.confirmRemove')}
                pendingLabel={t('odontogram.removing')}
                onConfirm={() => {
                    if (!imageToDelete) {
                        return;
                    }
                    deleteImageMutation.mutate({
                        entryId: imageToDelete.entryId,
                        imageId: imageToDelete.imageId,
                    });
                }}
            />

            <Dialog open={previewImage !== null} onOpenChange={(nextOpen) => !nextOpen && setPreviewImage(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>{previewImage?.title ?? t('odontogram.imagePreview')}</DialogTitle>
                    </DialogHeader>
                    {previewImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={previewImage.url}
                            alt={previewImage.title}
                            className="max-h-[70vh] w-full rounded-md object-contain"
                        />
                    ) : null}
                </DialogContent>
            </Dialog>
        </>
    );
}
