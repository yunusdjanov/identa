'use client';

import { useRef, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { deletePatientPhoto, listPatientCategories, updatePatient, uploadPatientPhoto } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiPatient } from '@/lib/api/types';
import { toast } from 'sonner';
import { useI18n } from '@/components/providers/i18n-provider';
import {
    INPUT_LIMITS,
    formatPhoneInputValue,
    getPhoneValidationMessage,
    getTextValidationMessage,
    normalizePhoneForApi,
} from '@/lib/input-validation';
import { PatientPhotoField } from '@/components/patients/patient-photo-field';

interface EditPatientDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    patient: ApiPatient;
}

interface PatientFormState {
    fullName: string;
    phone: string;
    secondaryPhone: string;
    categoryId: string;
    address: string;
    dateOfBirth: string;
    medicalHistory: string;
    allergies: string;
    currentMedications: string;
}
const NO_CATEGORY_VALUE = '__none__';
const MAX_PATIENT_PHOTO_SIZE_MB = 2;
const MAX_PATIENT_PHOTO_SIZE_BYTES = MAX_PATIENT_PHOTO_SIZE_MB * 1024 * 1024;

function createInitialState(patient: ApiPatient): PatientFormState {
    return {
        fullName: patient.full_name,
        phone: formatPhoneInputValue(patient.phone),
        secondaryPhone: formatPhoneInputValue(patient.secondary_phone ?? ''),
        categoryId: patient.categories?.[0]?.id ?? '',
        address: patient.address ?? '',
        dateOfBirth: patient.date_of_birth ?? '',
        medicalHistory: patient.medical_history ?? '',
        allergies: patient.allergies ?? '',
        currentMedications: patient.current_medications ?? '',
    };
}

export function EditPatientDialog({ open, onOpenChange, patient }: EditPatientDialogProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const photoInputRef = useRef<HTMLInputElement | null>(null);
    const [formData, setFormData] = useState<PatientFormState>(() => createInitialState(patient));
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoInputKey, setPhotoInputKey] = useState(0);
    const [removePhoto, setRemovePhoto] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const categoriesQuery = useQuery({
        queryKey: ['patient-categories', 'list'],
        queryFn: () => listPatientCategories(),
        staleTime: 60_000,
    });

    const fullName = formData.fullName.trim();
    const fullNameError = getTextValidationMessage(formData.fullName, {
        label: t('patients.form.fullName'),
        required: true,
        min: 3,
        max: INPUT_LIMITS.personName,
    });
    const addressError = getTextValidationMessage(formData.address, {
        label: t('patients.form.address'),
        min: 3,
        max: INPUT_LIMITS.address,
    });
    const phoneError = getPhoneValidationMessage(formData.phone, { required: true });
    const secondaryPhoneError = getPhoneValidationMessage(formData.secondaryPhone, { required: false });
    const hasValidationErrors = Boolean(fullNameError || phoneError || secondaryPhoneError || addressError);
    const handleDialogOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setIsSubmitted(false);
            setPhotoFile(null);
            setRemovePhoto(false);
            setPhotoInputKey((value) => value + 1);
        }
        onOpenChange(nextOpen);
    };

    const mutation = useMutation({
        mutationFn: async () => {
            const updatedPatient = await updatePatient(patient.id, {
                full_name: fullName,
                phone: normalizePhoneForApi(formData.phone),
                secondary_phone: formData.secondaryPhone ? normalizePhoneForApi(formData.secondaryPhone) : undefined,
                category_id: formData.categoryId || null,
                address: formData.address.trim() || undefined,
                date_of_birth: formData.dateOfBirth || undefined,
                medical_history: formData.medicalHistory.trim() || undefined,
                allergies: formData.allergies.trim() || undefined,
                current_medications: formData.currentMedications.trim() || undefined,
            });

            let photoActionError: string | null = null;
            if (removePhoto) {
                try {
                    await deletePatientPhoto(patient.id);
                } catch (error) {
                    photoActionError = getApiErrorMessage(error, t('patients.toast.photoDeleteFailed'));
                }
            }
            if (photoFile) {
                try {
                    await uploadPatientPhoto(patient.id, photoFile);
                } catch (error) {
                    photoActionError = getApiErrorMessage(error, t('patients.toast.photoUploadFailed'));
                }
            }

            return { updatedPatient, photoActionError };
        },
        onSuccess: ({ photoActionError }) => {
            toast.success(t('patients.toast.updateSuccess'));
            if (photoActionError) {
                toast.error(photoActionError);
            }
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['patients', 'detail', patient.id] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            handleDialogOpenChange(false);
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.toast.updateFailed')));
        },
    });

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();

        setIsSubmitted(true);
        if (hasValidationErrors) {
            toast.error(t('patients.toast.fixHighlighted'));
            return;
        }

        mutation.mutate();
    };

    const handlePhotoSelection = (selectedPhoto: File | null) => {
        if (!selectedPhoto) {
            setPhotoFile(null);
            return;
        }

        if (!selectedPhoto.type.startsWith('image/')) {
            toast.error(t('patients.toast.photoInvalidType'));
            setPhotoFile(null);
            setPhotoInputKey((value) => value + 1);
            return;
        }
        if (selectedPhoto.size > MAX_PATIENT_PHOTO_SIZE_BYTES) {
            toast.error(t('patients.toast.photoTooLarge', { sizeMb: MAX_PATIENT_PHOTO_SIZE_MB }));
            setPhotoFile(null);
            setPhotoInputKey((value) => value + 1);
            return;
        }

        setPhotoFile(selectedPhoto);
        setRemovePhoto(false);
    };
    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('patientDetail.editPatient')}</DialogTitle>
                    <DialogDescription>
                        {t('patients.dialog.editDescription')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4 border-b border-slate-200 pb-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {t('patients.form.photo')}
                        </p>
                        <PatientPhotoField
                            id="patientPhoto"
                            label={t('patients.form.photo')}
                            hint={t('patients.form.photoHint', { sizeMb: MAX_PATIENT_PHOTO_SIZE_MB })}
                            replaceLabel={t('patients.form.photoReplace')}
                            changeLabel={t('patients.form.photoChange')}
                            removeLabel={t('patients.form.photoRemove')}
                            dropTitle={t('patients.form.photoDropTitle')}
                            selectedTitle={t('patients.form.photoSelectedTitle')}
                            currentTitle={t('patients.form.photoCurrent')}
                            noFileLabel={t('patients.form.photoNoneSelected')}
                            patientName={formData.fullName || patient.full_name}
                            inputKey={photoInputKey}
                            inputRef={photoInputRef}
                            selectedFile={photoFile}
                            currentPhotoUrl={patient.photo_url && !removePhoto && !photoFile ? patient.photo_url : undefined}
                            onPickClick={() => photoInputRef.current?.click()}
                            onSelectFile={handlePhotoSelection}
                            onClearSelection={() => {
                                setPhotoFile(null);
                                if (patient.photo_url) {
                                    setRemovePhoto(true);
                                }
                                setPhotoInputKey((value) => value + 1);
                            }}
                            onRemoveCurrent={
                                patient.photo_url && !removePhoto && !photoFile
                                    ? () => {
                                        setRemovePhoto(true);
                                        setPhotoFile(null);
                                        setPhotoInputKey((value) => value + 1);
                                    }
                                    : undefined
                            }
                            hideLabel
                        />
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-medium text-sm text-gray-900">{t('patients.section.basicInfo')}</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="fullName">
                                    {t('patients.form.fullName')} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="fullName"
                                    required
                                    value={formData.fullName}
                                    onChange={(event) =>
                                        setFormData({ ...formData, fullName: event.target.value })
                                    }
                                    placeholder={t('patients.form.fullNamePlaceholder')}
                                    maxLength={INPUT_LIMITS.personName}
                                    aria-invalid={Boolean(isSubmitted && fullNameError)}
                                />
                                {isSubmitted && fullNameError ? (
                                    <p className="text-xs text-red-600">{fullNameError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="dateOfBirth">{t('patients.form.dateOfBirth')}</Label>
                                <Input
                                    id="dateOfBirth"
                                    type="date"
                                    value={formData.dateOfBirth}
                                    onChange={(event) =>
                                        setFormData({ ...formData, dateOfBirth: event.target.value })
                                    }
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone">
                                    {t('patients.form.phone')} <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="phone"
                                    type="tel"
                                    required
                                    value={formData.phone}
                                    onChange={(event) =>
                                        setFormData({ ...formData, phone: formatPhoneInputValue(event.target.value) })
                                    }
                                    placeholder={t('patients.form.phonePlaceholder')}
                                    maxLength={INPUT_LIMITS.phoneFormatted}
                                    inputMode="tel"
                                    autoComplete="tel"
                                    aria-invalid={Boolean(isSubmitted && phoneError)}
                                />
                                {isSubmitted && phoneError ? (
                                    <p className="text-xs text-red-600">{phoneError}</p>
                                ) : null}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="secondaryPhone">{t('patients.form.secondaryPhone')}</Label>
                                <Input
                                    id="secondaryPhone"
                                    type="tel"
                                    value={formData.secondaryPhone}
                                    onChange={(event) =>
                                        setFormData({
                                            ...formData,
                                            secondaryPhone: formatPhoneInputValue(event.target.value),
                                        })
                                    }
                                    placeholder={t('patients.form.secondaryPhonePlaceholder')}
                                    maxLength={INPUT_LIMITS.phoneFormatted}
                                    inputMode="tel"
                                    autoComplete="tel"
                                    aria-invalid={Boolean(isSubmitted && secondaryPhoneError)}
                                />
                                {isSubmitted && secondaryPhoneError ? (
                                    <p className="text-xs text-red-600">{secondaryPhoneError}</p>
                                ) : null}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="address">{t('patients.form.address')}</Label>
                            <Input
                                id="address"
                                value={formData.address}
                                onChange={(event) =>
                                    setFormData({ ...formData, address: event.target.value })
                                }
                                placeholder={t('patients.form.addressPlaceholder')}
                                maxLength={INPUT_LIMITS.address}
                                aria-invalid={Boolean(isSubmitted && addressError)}
                            />
                            {isSubmitted && addressError ? <p className="text-xs text-red-600">{addressError}</p> : null}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="categoryId">{t('patients.table.category')}</Label>
                            <Select
                                value={formData.categoryId || NO_CATEGORY_VALUE}
                                onValueChange={(value) =>
                                    setFormData({
                                        ...formData,
                                        categoryId: value === NO_CATEGORY_VALUE ? '' : value,
                                    })
                                }
                            >
                                <SelectTrigger id="categoryId" className="h-9 w-full">
                                    <SelectValue placeholder={t('patients.form.noCategory')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={NO_CATEGORY_VALUE}>{t('patients.form.noCategory')}</SelectItem>
                                    {(categoriesQuery.data ?? []).map((category) => (
                                        <SelectItem key={category.id} value={category.id}>
                                            {category.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-medium text-sm text-gray-900">{t('patients.section.medicalInfo')}</h3>

                        <div className="space-y-2">
                            <Label htmlFor="medicalHistory">{t('patientDetail.medicalHistory')}</Label>
                            <Textarea
                                id="medicalHistory"
                                value={formData.medicalHistory}
                                onChange={(event) =>
                                    setFormData({ ...formData, medicalHistory: event.target.value })
                                }
                                rows={3}
                                placeholder={t('patients.form.medicalHistoryPlaceholder')}
                                maxLength={INPUT_LIMITS.longText}
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="allergies">{t('patientDetail.allergies')}</Label>
                                <Input
                                    id="allergies"
                                    value={formData.allergies}
                                    onChange={(event) =>
                                        setFormData({ ...formData, allergies: event.target.value })
                                    }
                                    placeholder={t('patients.form.allergiesPlaceholder')}
                                    maxLength={INPUT_LIMITS.shortText}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="currentMedications">{t('patientDetail.currentMedications')}</Label>
                                <Input
                                    id="currentMedications"
                                    value={formData.currentMedications}
                                    onChange={(event) =>
                                        setFormData({
                                            ...formData,
                                            currentMedications: event.target.value,
                                        })
                                    }
                                    placeholder={t('patients.form.currentMedicationsPlaceholder')}
                                    maxLength={INPUT_LIMITS.shortText}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleDialogOpenChange(false)}
                            disabled={mutation.isPending}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={mutation.isPending}>
                            {mutation.isPending ? t('common.saving') : t('common.saveChanges')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
