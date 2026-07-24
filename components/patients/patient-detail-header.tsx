'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    AlertCircle,
    ArrowLeft,
    Archive,
    Calendar,
    CalendarPlus,
    Edit,
    FileText,
    MapPin,
    Maximize2,
    Phone,
    Pill,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { useI18n } from '@/components/providers/i18n-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import {
    archivePatient,
    permanentlyDeletePatient,
    restorePatient,
} from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import type { ApiPatient, ApiUser } from '@/lib/api/types';
import {
    canManage,
    canView,
    getManageDeniedMessage,
    isSubscriptionReadOnly,
} from '@/lib/auth/permissions';
import { INPUT_LIMITS } from '@/lib/input-validation';
import { PATIENTS_LIST_RESTORE_HREF } from '@/lib/patients/patient-list-state';
import {
    getProtectedMediaCrossOrigin,
    getProtectedMediaPreviewUrl,
    getProtectedMediaThumbnailUrl,
} from '@/lib/protected-media';
import { formatDate, getDaysSinceLastVisit, truncateForUi } from '@/lib/utils';

const EditPatientDialog = dynamic(
    () => import('@/components/patients/edit-patient-dialog').then((module) => module.EditPatientDialog),
    { ssr: false }
);

const PatientPhotoPreviewDialog = dynamic(
    () => import('@/components/patients/patient-photo-preview-dialog').then((module) => module.PatientPhotoPreviewDialog),
    { ssr: false }
);

const AddAppointmentDialog = dynamic(
    () => import('@/components/appointments/add-appointment-dialog').then((module) => module.AddAppointmentDialog),
    { ssr: false }
);

const PATIENT_HEADER_NAME_UI_LIMIT = 25;
const PATIENT_HEADER_NAME_SECOND_LINE_UI_LIMIT = 20;
const PATIENT_CATEGORY_CHIP_UI_LIMIT = 20;
const PATIENT_ALLERGIES_UI_LIMIT = INPUT_LIMITS.medicalAllergies;
const PATIENT_MEDICATIONS_UI_LIMIT = INPUT_LIMITS.medicalMedications;
const PATIENT_MEDICAL_HISTORY_UI_LIMIT = INPUT_LIMITS.medicalHistory;
const PATIENT_HEADER_NAME_FIRST_LINE_WORDS = 2;

function getPatientHeaderNameLines(fullName: string) {
    const nameParts = fullName.trim().split(/\s+/).filter(Boolean);

    if (nameParts.length <= PATIENT_HEADER_NAME_FIRST_LINE_WORDS) {
        return { firstLine: fullName, secondLine: null };
    }

    return {
        firstLine: nameParts.slice(0, PATIENT_HEADER_NAME_FIRST_LINE_WORDS).join(' '),
        secondLine: nameParts.slice(PATIENT_HEADER_NAME_FIRST_LINE_WORDS).join(' '),
    };
}

function getPatientInitials(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
        return '?';
    }

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

type PatientHeaderFactTone = 'teal' | 'rose' | 'amber' | 'slate' | 'sky';

const PATIENT_HEADER_FACT_TONE_CLASSES: Record<PatientHeaderFactTone, { icon: string; value: string; box: string }> = {
    teal: {
        icon: 'bg-teal-50 text-teal-600 ring-teal-100',
        value: 'text-slate-900',
        box: 'border-white/80 bg-white/75',
    },
    rose: {
        icon: 'bg-rose-50 text-rose-600 ring-rose-100',
        value: 'text-rose-900',
        box: 'border-rose-100/70 bg-rose-50/55',
    },
    amber: {
        icon: 'bg-amber-50 text-amber-600 ring-amber-100',
        value: 'text-amber-950',
        box: 'border-amber-100/80 bg-amber-50/55',
    },
    slate: {
        icon: 'bg-slate-100 text-slate-500 ring-slate-200/80',
        value: 'text-slate-800',
        box: 'border-white/80 bg-white/70',
    },
    sky: {
        icon: 'bg-sky-50 text-sky-600 ring-sky-100',
        value: 'text-slate-900',
        box: 'border-white/80 bg-white/75',
    },
};

function PatientHeaderFact({
    icon: Icon,
    label,
    value,
    title,
    tone = 'slate',
    className = '',
    valueClassName = '',
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: React.ReactNode;
    title?: string;
    tone?: PatientHeaderFactTone;
    className?: string;
    valueClassName?: string;
}) {
    const toneClasses = PATIENT_HEADER_FACT_TONE_CLASSES[tone];
    const isStringValue = typeof value === 'string';

    return (
        <div
            className={`flex min-w-0 items-center gap-2 overflow-hidden rounded-xl border px-2.5 py-1.5 ${toneClasses.box} ${className}`}
        >
            <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${toneClasses.icon}`}
                title={label}
            >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{label}</span>
            </span>
            <span
                className={`min-w-0 overflow-hidden text-[12px] font-semibold leading-5 ${isStringValue ? 'truncate' : ''} ${toneClasses.value} ${valueClassName}`}
                title={title}
            >
                {value}
            </span>
        </div>
    );
}

function PatientHeaderClinicalFact({
    icon: Icon,
    label,
    value,
    tone = 'slate',
    truncateLimit,
    emptyLabel,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string | null | undefined;
    tone?: 'rose' | 'amber' | 'slate';
    truncateLimit: number;
    emptyLabel: string;
}) {
    const safeValue = value?.trim() ?? '';
    const hasValue = safeValue.length > 0;
    const displayValue = hasValue ? truncateForUi(safeValue, truncateLimit) : emptyLabel;

    return (
        <PatientHeaderFact
            icon={Icon}
            label={label}
            value={displayValue}
            title={hasValue ? safeValue : label}
            tone={tone}
            className="h-10"
            valueClassName={hasValue ? '' : 'text-slate-400'}
        />
    );
}

function PatientHeaderMedicalEmptyState({
    icon: Icon,
    label,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
}) {
    return (
        <div
            data-testid="patient-detail-header-medical-empty"
            className="flex h-10 min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-white/80 bg-white/70 px-2.5 py-1.5 text-slate-500 md:col-span-3"
            title={label}
        >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 ring-1 ring-slate-200/80">
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{label}</span>
            </span>
            <span className="min-w-0 truncate text-[12px] font-semibold leading-5">{label}</span>
        </div>
    );
}

export function PatientDetailHeader({
    patient,
    currentUser,
}: {
    patient: ApiPatient;
    currentUser: ApiUser | null | undefined;
}) {
    const { t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
    const [isArchivePatientDialogOpen, setIsArchivePatientDialogOpen] = useState(false);
    const [isRestorePatientDialogOpen, setIsRestorePatientDialogOpen] = useState(false);
    const [isPermanentDeletePatientDialogOpen, setIsPermanentDeletePatientDialogOpen] = useState(false);
    const [isPatientPhotoPreviewOpen, setIsPatientPhotoPreviewOpen] = useState(false);
    const canViewPatients = canView(currentUser, 'patients');
    const canManagePatients = canManage(currentUser, 'patients');
    const canViewAppointments = canView(currentUser, 'appointments');
    const canManageAppointments = canManage(currentUser, 'appointments');
    const denyManageAction = () => toast.error(getManageDeniedMessage(currentUser, t));
    const isPatientArchived = Boolean(patient.is_archived);

    const archivePatientMutation = useMutation({
        mutationFn: () => archivePatient(patient.id),
        onSuccess: () => {
            toast.success(t('patientDetail.toast.archived'));
            setIsArchivePatientDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['patients', 'detail', patient.id] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patientDetail.toast.archiveFailed')));
        },
    });

    const restorePatientMutation = useMutation({
        mutationFn: () => restorePatient(patient.id),
        onSuccess: () => {
            toast.success(t('patientDetail.toast.restored'));
            setIsRestorePatientDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['patients', 'detail', patient.id] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patientDetail.toast.restoreFailed')));
        },
    });

    const permanentlyDeletePatientMutation = useMutation({
        mutationFn: () => permanentlyDeletePatient(patient.id),
        onSuccess: () => {
            toast.success(t('patientDetail.toast.permanentlyDeleted'));
            setIsPermanentDeletePatientDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            router.push('/patients');
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patientDetail.toast.permanentDeleteFailed')));
        },
    });

    const primaryCategory = patient.categories?.[0] ?? null;
    const patientAvatarUrl = getProtectedMediaThumbnailUrl({
        scanStatus: patient.photo_scan_status,
        thumbnailUrl: patient.photo_thumbnail_url,
        thumbnailReady: patient.photo_thumbnail_ready,
        previewUrl: patient.photo_preview_url,
        previewReady: patient.photo_preview_ready,
        url: patient.photo_url,
        allowFullFallback: true,
    }) ?? undefined;
    const patientAvatarPreviewUrl = getProtectedMediaPreviewUrl({
        scanStatus: patient.photo_scan_status,
        previewUrl: patient.photo_preview_url,
        url: patient.photo_url,
    }) ?? patientAvatarUrl;
    const compactEmptyValue = '—';
    const headerPhones = [patient.phone, patient.secondary_phone].filter((phone): phone is string => Boolean(phone));
    const headerPhoneTitle = headerPhones.length > 0 ? headerPhones.join(' / ') : t('patientDetail.notSpecified');
    const headerBirthDateValue = patient.date_of_birth ? formatDate(patient.date_of_birth) : compactEmptyValue;
    const headerAddressValue = patient.address?.trim() ? patient.address : compactEmptyValue;
    const hasHeaderMedicalFacts = Boolean(
        patient.allergies?.trim() || patient.current_medications?.trim() || patient.medical_history?.trim()
    );
    const patientHeaderNameLines = getPatientHeaderNameLines(patient.full_name);
    const daysSinceVisit = getDaysSinceLastVisit(patient.last_visit_at ?? undefined);
    const isInactive = Number.isFinite(daysSinceVisit) && daysSinceVisit > 180;

    return (
        <>
            <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm shadow-slate-200/70 sm:px-5 lg:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)] lg:items-center xl:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)_auto]">
                <div
                    data-testid="patient-detail-header-identity"
                    className="flex w-full min-w-0 max-w-[20rem] items-center gap-3"
                >
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label={t('patientDetail.backToPatients')}
                        onClick={() => router.push(PATIENTS_LIST_RESTORE_HREF)}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    {patientAvatarUrl ? (
                        <div className="relative h-20 w-24 shrink-0 overflow-visible">
                            <button
                                type="button"
                                className="group absolute left-0 top-1/2 h-24 w-24 -translate-y-1/2 overflow-hidden rounded-xl border border-white bg-white p-0 shadow-sm shadow-slate-200 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                                aria-label={`${t('patients.form.photo')}: ${patient.full_name}`}
                                onClick={() => setIsPatientPhotoPreviewOpen(true)}
                            >
                                <Avatar className="h-full w-full rounded-xl">
                                    <AvatarImage
                                        src={patientAvatarUrl}
                                        alt={patient.full_name}
                                        className="rounded-xl"
                                        crossOrigin={getProtectedMediaCrossOrigin(patientAvatarUrl)}
                                    />
                                    <AvatarFallback className="rounded-xl bg-slate-100 text-base font-semibold text-slate-700">
                                        {getPatientInitials(patient.full_name)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100 group-focus-visible:bg-slate-950/35 group-focus-visible:opacity-100">
                                    <Maximize2 className="h-4 w-4" />
                                </span>
                            </button>
                        </div>
                    ) : (
                        <div className="relative h-20 w-24 shrink-0 overflow-visible">
                            <Avatar className="absolute left-0 top-1/2 h-24 w-24 -translate-y-1/2 rounded-xl border border-white bg-slate-100 shadow-sm shadow-slate-200">
                                <AvatarFallback className="rounded-xl bg-slate-100 text-base font-semibold text-slate-700">
                                    {getPatientInitials(patient.full_name)}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <h1
                            data-testid="patient-detail-header-name"
                            className="max-w-full text-lg font-bold leading-tight tracking-[-0.02em] text-slate-950"
                            title={patient.full_name}
                        >
                            <span className="block truncate">
                                {truncateForUi(patientHeaderNameLines.firstLine, PATIENT_HEADER_NAME_UI_LIMIT)}
                            </span>
                            {patientHeaderNameLines.secondLine ? (
                                <span className="block truncate">
                                    {truncateForUi(patientHeaderNameLines.secondLine, PATIENT_HEADER_NAME_SECOND_LINE_UI_LIMIT)}
                                </span>
                            ) : null}
                        </h1>
                        <div className="mt-2 flex min-w-0 items-center gap-1.5">
                            {primaryCategory ? (
                                <Badge
                                    variant="secondary"
                                    className="max-w-full truncate border border-transparent text-xs"
                                    style={{
                                        backgroundColor: `${primaryCategory.color}22`,
                                        color: primaryCategory.color,
                                    }}
                                    title={primaryCategory.name}
                                >
                                    {truncateForUi(primaryCategory.name, PATIENT_CATEGORY_CHIP_UI_LIMIT)}
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="max-w-full truncate bg-slate-100 text-xs text-slate-600">
                                    {t('patients.uncategorized')}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
                <div
                    data-testid="patient-detail-header-facts"
                    className="grid h-auto min-w-0 grid-rows-[auto_auto_auto] gap-1.5 overflow-visible rounded-2xl border border-slate-100 bg-slate-50/60 px-2.5 py-2 shadow-sm shadow-slate-200/40 md:h-[8rem] md:grid-rows-[1fr_auto_1fr] md:overflow-hidden lg:col-span-2 lg:row-start-2 xl:col-span-1 xl:col-start-2 xl:row-start-1"
                >
                    <div
                        data-testid="patient-detail-header-contact-facts"
                        className="grid min-h-0 min-w-0 items-center gap-1.5 md:grid-cols-3"
                    >
                        <PatientHeaderFact
                            icon={Phone}
                            label={t('patientDetail.phone')}
                            value={
                                headerPhones.length > 0 ? (
                                    <span className="flex min-w-0 flex-col gap-0.5">
                                        {headerPhones.map((phone) => (
                                            <span key={phone} className="truncate tabular-nums">
                                                {phone}
                                            </span>
                                        ))}
                                    </span>
                                ) : (
                                    compactEmptyValue
                                )
                            }
                            title={headerPhoneTitle}
                            tone="teal"
                            className="h-11"
                            valueClassName={headerPhones.length > 0 ? '' : 'text-slate-400'}
                        />
                        <PatientHeaderFact
                            icon={Calendar}
                            label={t('patientDetail.birthDate')}
                            value={headerBirthDateValue}
                            title={patient.date_of_birth ? headerBirthDateValue : t('patientDetail.notSpecified')}
                            tone="sky"
                            className="h-11"
                            valueClassName="tabular-nums"
                        />
                        <PatientHeaderFact
                            icon={MapPin}
                            label={t('patientDetail.address')}
                            value={truncateForUi(headerAddressValue, 38)}
                            title={patient.address?.trim() ? patient.address : t('patientDetail.notSpecified')}
                            tone="teal"
                            className="h-11"
                            valueClassName={patient.address?.trim() ? '' : 'text-slate-400'}
                        />
                    </div>
                    <div aria-hidden="true" className="h-px bg-slate-200/70" />
                    <div
                        data-testid="patient-detail-header-medical-facts"
                        className="grid min-h-0 min-w-0 items-center gap-1.5 md:grid-cols-3"
                    >
                        {hasHeaderMedicalFacts ? (
                            <>
                                <PatientHeaderClinicalFact
                                    icon={AlertCircle}
                                    label={t('patientDetail.allergies')}
                                    value={patient.allergies}
                                    tone="rose"
                                    truncateLimit={PATIENT_ALLERGIES_UI_LIMIT}
                                    emptyLabel={compactEmptyValue}
                                />
                                <PatientHeaderClinicalFact
                                    icon={Pill}
                                    label={t('patientDetail.currentMedications')}
                                    value={patient.current_medications}
                                    tone="amber"
                                    truncateLimit={PATIENT_MEDICATIONS_UI_LIMIT}
                                    emptyLabel={compactEmptyValue}
                                />
                                <PatientHeaderClinicalFact
                                    icon={FileText}
                                    label={t('patientDetail.medicalHistory.label')}
                                    value={patient.medical_history}
                                    tone="slate"
                                    truncateLimit={PATIENT_MEDICAL_HISTORY_UI_LIMIT}
                                    emptyLabel={compactEmptyValue}
                                />
                            </>
                        ) : (
                            <PatientHeaderMedicalEmptyState icon={FileText} label={t('patientDetail.noMedicalInfo')} />
                        )}
                    </div>
                </div>
                <div
                    data-testid="patient-detail-header-actions"
                    className="flex flex-col items-end gap-2 lg:col-start-2 lg:row-start-1 lg:justify-end xl:col-start-3"
                >
                    {isPatientArchived ? (
                        <Badge variant="secondary" className="bg-slate-200 text-slate-800">
                            {t('patients.archived')}
                        </Badge>
                    ) : null}
                    {isInactive ? (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                            {t('patientDetail.inactive')}
                        </Badge>
                    ) : null}
                    {!isPatientArchived && canManageAppointments ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="rounded-full"
                            aria-label={t('appointments.dialog.newTitle')}
                            title={t('appointments.dialog.newTitle')}
                            onClick={() => setIsAppointmentDialogOpen(true)}
                        >
                            <CalendarPlus className="h-4 w-4" />
                        </Button>
                    ) : !isPatientArchived && isSubscriptionReadOnly(currentUser) && canViewAppointments ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="rounded-full"
                            aria-label={t('appointments.dialog.newTitle')}
                            title={t('appointments.dialog.newTitle')}
                            disabled
                            onClick={denyManageAction}
                        >
                            <CalendarPlus className="h-4 w-4" />
                        </Button>
                    ) : null}
                    {canManagePatients ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="rounded-full"
                            aria-label={t('patientDetail.editPatient')}
                            title={t('patientDetail.editPatient')}
                            onClick={() => setIsEditDialogOpen(true)}
                            disabled={isPatientArchived}
                        >
                            <Edit className="h-4 w-4" />
                        </Button>
                    ) : isSubscriptionReadOnly(currentUser) && canViewPatients ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="rounded-full"
                            aria-label={t('patientDetail.editPatient')}
                            title={t('patientDetail.editPatient')}
                            disabled
                            onClick={denyManageAction}
                        >
                            <Edit className="h-4 w-4" />
                        </Button>
                    ) : null}
                    {isPatientArchived ? (
                        <>
                            {canManagePatients ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 rounded-full px-3 text-xs"
                                    onClick={() => setIsRestorePatientDialogOpen(true)}
                                    disabled={
                                        restorePatientMutation.isPending
                                        || permanentlyDeletePatientMutation.isPending
                                    }
                                >
                                    {t('patients.restore')}
                                </Button>
                            ) : isSubscriptionReadOnly(currentUser) && canViewPatients ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 rounded-full px-3 text-xs"
                                    disabled
                                    onClick={denyManageAction}
                                >
                                    {t('patients.restore')}
                                </Button>
                            ) : null}
                            {canManagePatients ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 rounded-full px-3 text-xs text-red-600 hover:text-red-700"
                                    onClick={() => setIsPermanentDeletePatientDialogOpen(true)}
                                    disabled={
                                        restorePatientMutation.isPending
                                        || permanentlyDeletePatientMutation.isPending
                                    }
                                >
                                    <Trash2 className="mr-1.5 h-3 w-3" />
                                    {t('patientDetail.deletePermanently')}
                                </Button>
                            ) : isSubscriptionReadOnly(currentUser) && canViewPatients ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 rounded-full px-3 text-xs text-red-600 hover:text-red-700"
                                    disabled
                                    onClick={denyManageAction}
                                >
                                    <Trash2 className="mr-1.5 h-3 w-3" />
                                    {t('patientDetail.deletePermanently')}
                                </Button>
                            ) : null}
                        </>
                    ) : canManagePatients ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="rounded-full text-amber-700 hover:text-amber-800"
                            aria-label={t('patientDetail.archive')}
                            title={t('patientDetail.archive')}
                            onClick={() => setIsArchivePatientDialogOpen(true)}
                            disabled={archivePatientMutation.isPending}
                        >
                            <Archive className="h-4 w-4" />
                        </Button>
                    ) : isSubscriptionReadOnly(currentUser) && canViewPatients ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="rounded-full text-amber-700 hover:text-amber-800"
                            aria-label={t('patientDetail.archive')}
                            title={t('patientDetail.archive')}
                            disabled
                            onClick={denyManageAction}
                        >
                            <Archive className="h-4 w-4" />
                        </Button>
                    ) : null}
                </div>
            </div>

            {isEditDialogOpen && canManagePatients ? (
                <EditPatientDialog
                    key={`${patient.id}-open`}
                    open={isEditDialogOpen}
                    onOpenChange={setIsEditDialogOpen}
                    patient={patient}
                    uploadMaxMb={currentUser?.subscription?.upload_max_mb}
                />
            ) : null}

            {isAppointmentDialogOpen && canManageAppointments && !isPatientArchived ? (
                <AddAppointmentDialog
                    key={`${patient.id}-appointment`}
                    open={isAppointmentDialogOpen}
                    onOpenChange={(open) => {
                        setIsAppointmentDialogOpen(open);
                        if (!open) {
                            queryClient.invalidateQueries({
                                queryKey: ['patients', 'detail', patient.id, 'overview'],
                            });
                        }
                    }}
                    prefillPatientId={patient.id}
                />
            ) : null}

            {patientAvatarPreviewUrl ? (
                <PatientPhotoPreviewDialog
                    open={isPatientPhotoPreviewOpen}
                    onOpenChange={setIsPatientPhotoPreviewOpen}
                    images={[{
                        src: patientAvatarPreviewUrl,
                        thumbnailSrc: patientAvatarUrl,
                        alt: patient.full_name,
                        title: patient.full_name,
                    }]}
                    alt={patient.full_name}
                    title={patient.full_name}
                />
            ) : null}

            <ConfirmActionDialog
                open={isArchivePatientDialogOpen}
                onOpenChange={setIsArchivePatientDialogOpen}
                title={t('patientDetail.archiveTitle')}
                description={t('patientDetail.archiveDescription', { patientName: patient.full_name })}
                confirmLabel={t('patientDetail.archiveConfirm')}
                pendingLabel={t('patientDetail.archiving')}
                confirmVariant="destructive"
                isPending={archivePatientMutation.isPending}
                onConfirm={() => archivePatientMutation.mutate()}
            />

            <ConfirmActionDialog
                open={isRestorePatientDialogOpen}
                onOpenChange={setIsRestorePatientDialogOpen}
                title={t('patientDetail.restoreTitle')}
                description={t('patientDetail.restoreDescription', { patientName: patient.full_name })}
                confirmLabel={t('patientDetail.restoreConfirm')}
                pendingLabel={t('patientDetail.restoring')}
                isPending={restorePatientMutation.isPending}
                onConfirm={() => restorePatientMutation.mutate()}
            />

            <ConfirmActionDialog
                open={isPermanentDeletePatientDialogOpen}
                onOpenChange={setIsPermanentDeletePatientDialogOpen}
                title={t('patientDetail.permanentDeleteTitle')}
                description={t('patientDetail.permanentDeleteDescription', { patientName: patient.full_name })}
                confirmLabel={t('patientDetail.permanentDeleteConfirm')}
                pendingLabel={t('payments.deleting')}
                confirmVariant="destructive"
                requireConfirmationText={patient.full_name}
                confirmationLabel={t('patientDetail.permanentDeleteTypeName', { patientName: patient.full_name })}
                confirmationPlaceholder={patient.full_name}
                isPending={permanentlyDeletePatientMutation.isPending}
                onConfirm={() => permanentlyDeletePatientMutation.mutate()}
            />
        </>
    );
}
