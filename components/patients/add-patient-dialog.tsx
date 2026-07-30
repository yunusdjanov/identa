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
import { toast } from 'sonner';
import {
    createPatient,
    listPatientCategories,
    uploadPatientPhoto,
    type CreatePatientPayload,
} from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiPatient } from '@/lib/api/types';
import { optimizeImageFileForUpload } from '@/lib/browser-image';
import { useI18n } from '@/components/providers/i18n-provider';
import {
    INPUT_LIMITS,
    formatPhoneInputValue,
    getPhoneValidationMessage,
    getTextValidationMessage,
    normalizePhoneForApi,
} from '@/lib/input-validation';
import { PatientPhotoField } from '@/components/patients/patient-photo-field';
import { toLocalDateKey } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';

interface AddPatientDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    uploadMaxMb?: number | null;
    /**
     * Prefills the reusable patient form. Used by appointment conversion so the
     * clinician can review and correct guest name/phone before creating a card.
     */
    initialValues?: Partial<Pick<CreatePatientPayload, 'full_name' | 'phone'>>;
    /**
     * Optional submit override for flows that need a transactional backend action.
     * Defaults to regular patient creation.
     */
    submitPatient?: (payload: CreatePatientPayload) => Promise<ApiPatient>;
    /** Custom success copy for contextual creation flows. */
    successMessage?: (patient: ApiPatient) => string;
}

function createInitialFormData(initialValues?: AddPatientDialogProps['initialValues']) {
    return {
        fullName: initialValues?.full_name ?? '',
        phone: initialValues?.phone ? formatPhoneInputValue(initialValues.phone) : '',
        secondaryPhone: '',
        categoryId: '',
        address: '',
        dateOfBirth: '',
        medicalHistory: '',
        allergies: '',
        currentMedications: '',
    };
}
const NO_CATEGORY_VALUE = '__none__';
const DEFAULT_PATIENT_PHOTO_UPLOAD_MAX_MB = 1;

export function AddPatientDialog({
    open,
    onOpenChange,
    uploadMaxMb = DEFAULT_PATIENT_PHOTO_UPLOAD_MAX_MB,
    initialValues,
    submitPatient = createPatient,
    successMessage,
}: AddPatientDialogProps) {
    const { t } = useI18n();
    const queryClient = useQueryClient();
    const photoInputRef = useRef<HTMLInputElement | null>(null);
    const [formData, setFormData] = useState(() => createInitialFormData(initialValues));
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoInputKey, setPhotoInputKey] = useState(0);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const categoriesQuery = useQuery({
        queryKey: queryKeys.patientCategories.list(),
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
    const medicalHistoryError = getTextValidationMessage(formData.medicalHistory, {
        label: t('patientDetail.medicalHistory'),
        max: INPUT_LIMITS.medicalHistory,
    });
    const allergiesError = getTextValidationMessage(formData.allergies, {
        label: t('patientDetail.allergies'),
        max: INPUT_LIMITS.medicalAllergies,
    });
    const currentMedicationsError = getTextValidationMessage(formData.currentMedications, {
        label: t('patientDetail.currentMedications'),
        max: INPUT_LIMITS.medicalMedications,
    });
    const phoneError = getPhoneValidationMessage(formData.phone, { required: true });
    const secondaryPhoneError = getPhoneValidationMessage(formData.secondaryPhone, { required: false });
    const hasValidationErrors = Boolean(fullNameError || phoneError || secondaryPhoneError || addressError || medicalHistoryError || allergiesError || currentMedicationsError);
    const photoUploadMaxMb = uploadMaxMb ?? DEFAULT_PATIENT_PHOTO_UPLOAD_MAX_MB;
    const photoUploadMaxBytes = photoUploadMaxMb * 1024 * 1024;

    const handleDialogOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setIsSubmitted(false);
            setPhotoFile(null);
            setPhotoInputKey((value) => value + 1);
        }
        onOpenChange(nextOpen);
    };

    const mutation = useMutation({
        mutationFn: async () => {
            const patientPayload: CreatePatientPayload = {
                full_name: fullName,
                phone: normalizePhoneForApi(formData.phone),
                secondary_phone: formData.secondaryPhone ? normalizePhoneForApi(formData.secondaryPhone) : undefined,
                category_id: formData.categoryId || undefined,
                address: formData.address.trim() || undefined,
                date_of_birth: formData.dateOfBirth || undefined,
                medical_history: formData.medicalHistory.trim() || undefined,
                allergies: formData.allergies.trim() || undefined,
                current_medications: formData.currentMedications.trim() || undefined,
            };
            const createdPatient = await submitPatient(patientPayload);

            let photoUploadError: string | null = null;
            if (photoFile) {
                try {
                    await uploadPatientPhoto(createdPatient.id, photoFile);
                } catch (error) {
                    photoUploadError = getApiErrorMessage(error, t('patients.toast.photoUploadFailed'));
                }
            }

            return { createdPatient, photoUploadError };
        },
        onSuccess: ({ createdPatient, photoUploadError }) => {
            toast.success(successMessage?.(createdPatient) ?? t('patients.toast.addSuccess', { patientName: createdPatient.full_name }));
            if (photoUploadError) {
                toast.error(photoUploadError);
            }
            setFormData(createInitialFormData(initialValues));
            setPhotoFile(null);
            setPhotoInputKey((value) => value + 1);
            setIsSubmitted(false);
            handleDialogOpenChange(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.toast.addFailed')));
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

    const handlePhotoSelection = async (selectedPhoto: File | null) => {
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
        if (selectedPhoto.size > photoUploadMaxBytes) {
            toast.error(t('patients.toast.photoTooLarge', { sizeMb: photoUploadMaxMb }));
            setPhotoFile(null);
            setPhotoInputKey((value) => value + 1);
            return;
        }

        // Client-side optimization is a bandwidth helper only — the backend
        // image pipeline auto-compresses with quality-preserving heuristics
        // and no longer enforces a per-file stored cap. We trust the backend
        // to fit storage, so we don't reject the optimized result here.
        const optimizedPhoto = await optimizeImageFileForUpload(selectedPhoto, {
            maxEdge: 1400,
            targetMaxBytes: null,
        });

        setPhotoFile(optimizedPhoto);
    };
    return (
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[calc(100dvh-1.5rem)] max-w-2xl overflow-y-auto p-5 sm:p-6">
                <DialogHeader>
                    <DialogTitle>{t('patients.addPatient')}</DialogTitle>
                    <DialogDescription>
                        {t('patients.dialog.addDescription')}
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
                            hint={t('patients.form.photoHint', { sizeMb: photoUploadMaxMb })}
                            replaceLabel={t('patients.form.photoReplace')}
                            changeLabel={t('patients.form.photoChange')}
                            removeLabel={t('patients.form.photoRemove')}
                            dropTitle={t('patients.form.photoDropTitle')}
                            selectedTitle={t('patients.form.photoSelectedTitle')}
                            currentTitle={t('patients.form.photoCurrent')}
                            noFileLabel={t('patients.form.photoNoneSelected')}
                            patientName={formData.fullName}
                            inputKey={photoInputKey}
                            inputRef={photoInputRef}
                            selectedFile={photoFile}
                            onPickClick={() => photoInputRef.current?.click()}
                            onSelectFile={handlePhotoSelection}
                            onClearSelection={() => {
                                setPhotoFile(null);
                                setPhotoInputKey((value) => value + 1);
                            }}
                            hideLabel
                        />
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-medium text-sm text-slate-900">{t('patients.section.basicInfo')}</h3>

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
                                    max={toLocalDateKey(new Date())}
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
                        <h3 className="font-medium text-sm text-slate-900">{t('patients.section.medicalInfo')}</h3>

                        <div className="space-y-2">
                            <Label htmlFor="medicalHistory">{t('patientDetail.medicalHistory')}</Label>
                            <Textarea
                                id="medicalHistory"
                                value={formData.medicalHistory}
                                onChange={(event) =>
                                    setFormData({ ...formData, medicalHistory: event.target.value })
                                }
                                placeholder={t('patients.form.medicalHistoryPlaceholder')}
                                rows={3}
                                maxLength={INPUT_LIMITS.medicalHistory}
                                aria-invalid={Boolean(isSubmitted && medicalHistoryError)}
                            />
                            {isSubmitted && medicalHistoryError ? (
                                <p className="text-xs text-red-600">{medicalHistoryError}</p>
                            ) : null}
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
                                    maxLength={INPUT_LIMITS.medicalAllergies}
                                    aria-invalid={Boolean(isSubmitted && allergiesError)}
                                />
                                {isSubmitted && allergiesError ? (
                                    <p className="text-xs text-red-600">{allergiesError}</p>
                                ) : null}
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
                                    maxLength={INPUT_LIMITS.medicalMedications}
                                    aria-invalid={Boolean(isSubmitted && currentMedicationsError)}
                                />
                                {isSubmitted && currentMedicationsError ? (
                                    <p className="text-xs text-red-600">{currentMedicationsError}</p>
                                ) : null}
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
                            {mutation.isPending ? t('patients.action.adding') : t('patients.addPatient')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
