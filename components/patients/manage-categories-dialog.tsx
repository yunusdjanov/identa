'use client';

import { useMemo, useState } from 'react';
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
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    createPatientCategory,
    deletePatientCategory,
    listPatientCategories,
    updatePatientCategory,
} from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { toast } from 'sonner';
import { INPUT_LIMITS, getTextValidationMessage } from '@/lib/input-validation';
import { useI18n } from '@/components/providers/i18n-provider';
import { truncateForUi } from '@/lib/utils';

interface ManageCategoriesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const DEFAULT_COLOR = '#3B82F6';
const CATEGORY_CHIP_UI_LIMIT = 20;

export function ManageCategoriesDialog({ open, onOpenChange }: ManageCategoriesDialogProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(DEFAULT_COLOR);
    const [createSubmitAttempted, setCreateSubmitAttempted] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingColor, setEditingColor] = useState(DEFAULT_COLOR);
    const [editSubmitAttempted, setEditSubmitAttempted] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [categoryToDelete, setCategoryToDelete] = useState<{ id: string; name: string } | null>(null);

    const categoriesQuery = useQuery({
        queryKey: ['patient-categories', 'list'],
        queryFn: () => listPatientCategories(),
        enabled: open,
    });

    const categories = useMemo(
        () => (categoriesQuery.data ?? []).slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
        [categoriesQuery.data]
    );
    const newNameTrimmed = newName.trim();
    const editNameTrimmed = editingName.trim();
    const newNameError = getTextValidationMessage(newName, {
        label: t('patients.categories.categoryName'),
        required: true,
        min: 3,
        max: INPUT_LIMITS.categoryName,
    });
    const editNameError = getTextValidationMessage(editingName, {
        label: t('patients.categories.categoryName'),
        required: true,
        min: 3,
        max: INPUT_LIMITS.categoryName,
    });

    const createMutation = useMutation({
        mutationFn: () =>
            createPatientCategory({
                name: newNameTrimmed,
                color: newColor,
                sort_order: categories.length + 1,
            }),
        onSuccess: () => {
            toast.success(t('patients.categories.created'));
            setNewName('');
            setNewColor(DEFAULT_COLOR);
            setCreateSubmitAttempted(false);
            queryClient.invalidateQueries({ queryKey: ['patient-categories'] });
            queryClient.invalidateQueries({ queryKey: ['patients'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.categories.createFailed')));
        },
    });

    const updateMutation = useMutation({
        mutationFn: (payload: { id: string; sort_order: number }) =>
            updatePatientCategory(payload.id, {
                name: editNameTrimmed,
                color: editingColor,
                sort_order: payload.sort_order,
            }),
        onSuccess: () => {
            toast.success(t('patients.categories.updated'));
            setEditingId(null);
            setEditingName('');
            setEditingColor(DEFAULT_COLOR);
            setEditSubmitAttempted(false);
            queryClient.invalidateQueries({ queryKey: ['patient-categories'] });
            queryClient.invalidateQueries({ queryKey: ['patients'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.categories.updateFailed')));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deletePatientCategory(id),
        onSuccess: () => {
            toast.success(t('patients.categories.deleted'));
            setIsDeleteDialogOpen(false);
            setCategoryToDelete(null);
            queryClient.invalidateQueries({ queryKey: ['patient-categories'] });
            queryClient.invalidateQueries({ queryKey: ['patients'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.categories.deleteFailed')));
        },
    });

    const handleCreate = () => {
        setCreateSubmitAttempted(true);
        if (newNameError) {
            toast.error(newNameError);
            return;
        }

        createMutation.mutate();
    };

    const startEdit = (category: { id: string; name: string; color: string }) => {
        setEditingId(category.id);
        setEditingName(category.name);
        setEditingColor(category.color);
        setEditSubmitAttempted(false);
    };

    const handleSaveEdit = (category: { id: string; sort_order: number }) => {
        setEditSubmitAttempted(true);
        if (editNameError) {
            toast.error(editNameError);
            return;
        }

        updateMutation.mutate({ id: category.id, sort_order: category.sort_order });
    };

    const openDeleteDialog = (category: { id: string; name: string }) => {
        setCategoryToDelete(category);
        setIsDeleteDialogOpen(true);
    };

    const handleDeleteDialogOpenChange = (isOpen: boolean) => {
        setIsDeleteDialogOpen(isOpen);
        if (!isOpen) {
            setCategoryToDelete(null);
        }
    };

    const confirmDelete = () => {
        if (!categoryToDelete) {
            return;
        }

        deleteMutation.mutate(categoryToDelete.id);
    };

    const handleDialogOpenChange = (isOpen: boolean) => {
        onOpenChange(isOpen);
        if (!isOpen) {
            setCreateSubmitAttempted(false);
            setEditSubmitAttempted(false);
            setEditingId(null);
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={handleDialogOpenChange}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t('patients.categories.manageTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('patients.categories.manageDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="rounded-lg border border-gray-200 p-3">
                            <p className="mb-3 text-sm font-medium text-gray-900">{t('patients.categories.newCategory')}</p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
                                <div className="space-y-2">
                                    <Label htmlFor="newCategoryName">{t('patients.categories.categoryName')}</Label>
                                    <Input
                                        id="newCategoryName"
                                        value={newName}
                                        onChange={(event) => setNewName(event.target.value)}
                                        placeholder={t('patients.categories.categoryNamePlaceholder')}
                                        maxLength={INPUT_LIMITS.categoryName}
                                        aria-invalid={Boolean(createSubmitAttempted && newNameError)}
                                    />
                                    {createSubmitAttempted && newNameError ? (
                                        <p className="text-xs text-red-600">{newNameError}</p>
                                    ) : null}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="newCategoryColor">{t('patients.categories.color')}</Label>
                                    <Input
                                        id="newCategoryColor"
                                        type="color"
                                        value={newColor}
                                        onChange={(event) => setNewColor(event.target.value)}
                                        className="w-16 p-1"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <Button
                                        onClick={handleCreate}
                                        disabled={createMutation.isPending}
                                    >
                                        {createMutation.isPending ? t('patients.categories.adding') : t('patients.categories.add')}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {categoriesQuery.isLoading ? (
                                <p className="text-sm text-gray-500">{t('patients.categories.loading')}</p>
                            ) : categories.length === 0 ? (
                                <p className="text-sm text-gray-500">{t('patients.categories.empty')}</p>
                            ) : (
                                categories.map((category) => (
                                    <div
                                        key={category.id}
                                        className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
                                    >
                                        {editingId === category.id ? (
                                            <div className="flex flex-1 items-end gap-2">
                                                <div className="flex-1 space-y-1">
                                                    <Label htmlFor={`edit-category-${category.id}`}>{t('patients.categories.categoryName')}</Label>
                                                    <Input
                                                        id={`edit-category-${category.id}`}
                                                        value={editingName}
                                                        onChange={(event) => setEditingName(event.target.value)}
                                                        maxLength={INPUT_LIMITS.categoryName}
                                                        aria-invalid={Boolean(editSubmitAttempted && editNameError)}
                                                    />
                                                    {editSubmitAttempted && editNameError ? (
                                                        <p className="text-xs text-red-600">{editNameError}</p>
                                                    ) : null}
                                                </div>
                                                <div className="space-y-1">
                                                    <Label htmlFor={`edit-color-${category.id}`}>{t('patients.categories.color')}</Label>
                                                    <Input
                                                        id={`edit-color-${category.id}`}
                                                        type="color"
                                                        value={editingColor}
                                                        onChange={(event) => setEditingColor(event.target.value)}
                                                        className="w-14 p-1"
                                                    />
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSaveEdit(category)}
                                                    disabled={updateMutation.isPending}
                                                >
                                                    {t('common.saveChanges')}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setEditingId(null);
                                                        setEditSubmitAttempted(false);
                                                    }}
                                                >
                                                    {t('common.cancel')}
                                                </Button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center gap-3">
                                                    <span
                                                        className="h-3 w-3 rounded-full border border-gray-300"
                                                        style={{ backgroundColor: category.color }}
                                                    />
                                                    <span className="max-w-[16rem] truncate text-sm font-medium text-gray-900" title={category.name}>
                                                        {truncateForUi(category.name, CATEGORY_CHIP_UI_LIMIT)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Button size="sm" variant="outline" onClick={() => startEdit(category)}>
                                                        {t('payments.edit')}
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-red-600 hover:text-red-700"
                                                        onClick={() => openDeleteDialog(category)}
                                                        disabled={deleteMutation.isPending}
                                                    >
                                                        {t('payments.delete')}
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            {t('patients.categories.close')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmActionDialog
                open={isDeleteDialogOpen}
                onOpenChange={handleDeleteDialogOpenChange}
                title={t('patients.categories.deleteTitle')}
                description={
                    categoryToDelete
                        ? t('patients.categories.deleteDescription', { categoryName: categoryToDelete.name })
                        : t('patients.categories.deleteDescriptionFallback')
                }
                disabled={!categoryToDelete}
                isPending={deleteMutation.isPending}
                confirmLabel={t('patients.categories.confirmDelete')}
                pendingLabel={t('patients.categories.deleting')}
                onConfirm={confirmDelete}
            />
        </>
    );
}
