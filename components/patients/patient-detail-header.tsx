'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    AlertCircle,
    ArrowLeft,
    Archive,
    Cake,
    Calendar,
    CalendarPlus,
    Clock3,
    Edit,
    FileText,
    Loader2,
    MapPin,
    Maximize2,
    MoreHorizontal,
    Phone,
    Pill,
    RotateCcw,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { useI18n } from '@/components/providers/i18n-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { queryKeys } from '@/lib/query-keys';

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

function getPatientAge(dateOfBirth: string | null | undefined): number | null {
    if (!dateOfBirth) {
        return null;
    }

    const [year, month, day] = dateOfBirth.slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) {
        return null;
    }

    const today = new Date();
    let age = today.getFullYear() - year;
    const birthdayPassed = today.getMonth() + 1 > month
        || (today.getMonth() + 1 === month && today.getDate() >= day);

    if (!birthdayPassed) {
        age -= 1;
    }

    return age >= 0 ? age : null;
}

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
        box: 'border-transparent bg-transparent lg:border-white/80 lg:bg-white/75',
    },
    rose: {
        icon: 'bg-rose-50 text-rose-600 ring-rose-100',
        value: 'text-rose-900',
        box: 'border-transparent bg-transparent lg:border-rose-100/70 lg:bg-rose-50/55',
    },
    amber: {
        icon: 'bg-amber-50 text-amber-600 ring-amber-100',
        value: 'text-amber-950',
        box: 'border-transparent bg-transparent lg:border-amber-100/80 lg:bg-amber-50/55',
    },
    slate: {
        icon: 'bg-slate-100 text-slate-500 ring-slate-200/80',
        value: 'text-slate-800',
        box: 'border-transparent bg-transparent lg:border-white/80 lg:bg-white/70',
    },
    sky: {
        icon: 'bg-sky-50 text-sky-600 ring-sky-100',
        value: 'text-slate-900',
        box: 'border-transparent bg-transparent lg:border-white/80 lg:bg-white/75',
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
    mobileAppLayout = false,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: React.ReactNode;
    title?: string;
    tone?: PatientHeaderFactTone;
    className?: string;
    valueClassName?: string;
    mobileAppLayout?: boolean;
}) {
    const toneClasses = PATIENT_HEADER_FACT_TONE_CLASSES[tone];
    const isStringValue = typeof value === 'string';

    return (
        <div
            className={`flex min-h-12 min-w-0 items-center gap-2.5 overflow-hidden border lg:min-h-0 lg:gap-2 lg:rounded-xl lg:px-2.5 lg:py-1.5 ${mobileAppLayout ? 'rounded-none border-transparent px-3 py-2.5' : 'rounded-xl px-2.5 py-2'} ${toneClasses.box} ${className}`}
        >
            <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${toneClasses.icon}`}
                title={label}
            >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{label}</span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden">
                <span className="truncate text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400 lg:sr-only">
                    {label}
                </span>
                <span
                    className={`min-w-0 overflow-hidden text-[12px] font-semibold leading-5 ${isStringValue ? 'truncate' : ''} ${toneClasses.value} ${valueClassName}`}
                    title={title}
                >
                    {value}
                </span>
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
    mobileAppLayout = false,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string | null | undefined;
    tone?: 'rose' | 'amber' | 'slate';
    truncateLimit: number;
    emptyLabel: string;
    mobileAppLayout?: boolean;
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
            className="min-h-12 lg:h-10"
            valueClassName={hasValue ? '' : 'text-slate-400'}
            mobileAppLayout={mobileAppLayout}
        />
    );
}

function PatientHeaderMedicalEmptyState({
    icon: Icon,
    label,
    mobileAppLayout = false,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    mobileAppLayout?: boolean;
}) {
    return (
        <div
            data-testid="patient-detail-header-medical-empty"
            className={`flex min-h-12 min-w-0 items-center gap-2.5 overflow-hidden border border-transparent bg-transparent text-slate-500 lg:col-span-3 lg:h-10 lg:min-h-0 lg:gap-2 lg:rounded-xl lg:border-white/80 lg:bg-white/70 lg:px-2.5 lg:py-1.5 ${mobileAppLayout ? 'rounded-none px-3 py-2.5' : 'rounded-xl px-2.5 py-2'}`}
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
    mobileAppLayout = false,
    visitCount = 0,
}: {
    patient: ApiPatient;
    currentUser: ApiUser | null | undefined;
    mobileAppLayout?: boolean;
    visitCount?: number;
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
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.detail(patient.id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.payments.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
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
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.detail(patient.id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.payments.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
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
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.payments.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all() });
            router.push('/patients');
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patientDetail.toast.permanentDeleteFailed')));
        },
    });

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
    const isPatientPhotoProcessing = patient.photo_processing_status === 'pending';
    const isPatientPhotoRejected = patient.photo_processing_status === 'rejected';
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
    const patientAge = getPatientAge(patient.date_of_birth);
    const visibleCategories = patient.categories?.slice(0, mobileAppLayout ? 3 : 1) ?? [];
    const patientPhoneHref = patient.phone?.trim()
        ? `tel:${patient.phone.replace(/\s+/g, '')}`
        : null;

    return (
        <>
            {mobileAppLayout ? (
                <div
                    data-testid="patient-detail-mobile-topbar"
                    className="flex min-h-11 items-center gap-2 px-1 lg:hidden"
                >
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 rounded-full bg-teal-50 text-teal-700 hover:bg-teal-100"
                        aria-label={t('patientDetail.backToPatients')}
                        onClick={() => router.push(PATIENTS_LIST_RESTORE_HREF)}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <p className="min-w-0 flex-1 truncate text-center text-sm font-bold text-slate-900">
                        {patient.full_name}
                    </p>
                    {canManagePatients ? (
                        <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 shrink-0 rounded-full bg-teal-50 text-teal-700 hover:bg-teal-100"
                                    aria-label={t('patientDetail.moreActions')}
                                >
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                {isPatientArchived ? (
                                    <>
                                        <DropdownMenuItem
                                            disabled={restorePatientMutation.isPending || permanentlyDeletePatientMutation.isPending}
                                            onSelect={() => setIsRestorePatientDialogOpen(true)}
                                        >
                                            <RotateCcw />
                                            {t('patients.restore')}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            variant="destructive"
                                            disabled={restorePatientMutation.isPending || permanentlyDeletePatientMutation.isPending}
                                            onSelect={() => setIsPermanentDeletePatientDialogOpen(true)}
                                        >
                                            <Trash2 />
                                            {t('patientDetail.deletePermanently')}
                                        </DropdownMenuItem>
                                    </>
                                ) : (
                                    <DropdownMenuItem
                                        variant="destructive"
                                        disabled={archivePatientMutation.isPending}
                                        onSelect={() => setIsArchivePatientDialogOpen(true)}
                                    >
                                        <Archive />
                                        {t('patientDetail.archive')}
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <span className="h-9 w-9 shrink-0" aria-hidden="true" />
                    )}
                </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)] lg:items-center lg:gap-2.5 lg:rounded-2xl lg:border lg:border-slate-200/70 lg:bg-white lg:px-4 lg:py-3 lg:shadow-sm lg:shadow-slate-200/60 xl:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)_auto]">
                <div
                    data-testid="patient-detail-header-identity"
                    className={`relative flex w-full min-w-0 flex-col items-center px-4 text-center lg:static lg:max-w-[20rem] lg:flex-row lg:gap-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:text-left lg:shadow-none ${mobileAppLayout ? 'pb-1 pt-1' : 'rounded-3xl border border-white/90 bg-white pb-4 pt-12 shadow-sm shadow-slate-200/60'}`}
                >
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`${mobileAppLayout ? 'hidden' : 'absolute'} left-3 top-3 h-9 w-9 shrink-0 rounded-full bg-teal-50 text-teal-700 hover:bg-teal-100 lg:static lg:flex lg:h-8 lg:w-8 lg:bg-transparent lg:text-foreground`}
                        aria-label={t('patientDetail.backToPatients')}
                        onClick={() => router.push(PATIENTS_LIST_RESTORE_HREF)}
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    {patientAvatarUrl ? (
                        <div className="relative h-20 w-20 shrink-0 overflow-visible lg:h-20 lg:w-24">
                            <button
                                type="button"
                                className="group absolute left-0 top-1/2 h-20 w-20 -translate-y-1/2 overflow-hidden rounded-full border-2 border-white bg-white p-0 shadow-md shadow-slate-200 transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 lg:h-24 lg:w-24 lg:rounded-xl lg:border lg:shadow-sm"
                                aria-label={`${t('patients.form.photo')}: ${patient.full_name}`}
                                onClick={() => setIsPatientPhotoPreviewOpen(true)}
                            >
                                <Avatar className="h-full w-full rounded-full lg:rounded-xl">
                                    <AvatarImage
                                        src={patientAvatarUrl}
                                        alt={patient.full_name}
                                        className="rounded-full lg:rounded-xl"
                                        crossOrigin={getProtectedMediaCrossOrigin(patientAvatarUrl)}
                                    />
                                    <AvatarFallback className="rounded-full bg-slate-100 text-lg font-semibold text-slate-700 lg:rounded-xl">
                                        {getPatientInitials(patient.full_name)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100 group-focus-visible:bg-slate-950/35 group-focus-visible:opacity-100">
                                    <Maximize2 className="h-4 w-4" />
                                </span>
                                {isPatientPhotoProcessing ? (
                                    <span className="absolute right-1.5 top-1.5 rounded-full bg-slate-950/75 p-1.5 text-white" title={t('patientDetail.oralPhoto.processing')}>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                        <span className="sr-only">{t('patientDetail.oralPhoto.processing')}</span>
                                    </span>
                                ) : isPatientPhotoRejected ? (
                                    <span className="absolute right-1.5 top-1.5 rounded-full bg-red-600 p-1.5 text-white" title={t('patientDetail.oralPhoto.rejected')}>
                                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                        <span className="sr-only">{t('patientDetail.oralPhoto.rejected')}</span>
                                    </span>
                                ) : null}
                            </button>
                        </div>
                    ) : (
                        <div className="relative h-20 w-20 shrink-0 overflow-visible lg:h-20 lg:w-24">
                            <Avatar className="absolute left-0 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full border-2 border-white bg-slate-100 shadow-md shadow-slate-200 lg:h-24 lg:w-24 lg:rounded-xl lg:border lg:shadow-sm">
                                <AvatarFallback className="rounded-full bg-slate-100 text-lg font-semibold text-slate-700 lg:rounded-xl">
                                    {getPatientInitials(patient.full_name)}
                                </AvatarFallback>
                            </Avatar>
                            {isPatientPhotoProcessing ? (
                                <span className="absolute right-1.5 top-0 rounded-full bg-slate-700 p-1.5 text-white" title={t('patientDetail.oralPhoto.processing')}>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                    <span className="sr-only">{t('patientDetail.oralPhoto.processing')}</span>
                                </span>
                            ) : isPatientPhotoRejected ? (
                                <span className="absolute right-1.5 top-0 rounded-full bg-red-600 p-1.5 text-white" title={t('patientDetail.oralPhoto.rejected')}>
                                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span className="sr-only">{t('patientDetail.oralPhoto.rejected')}</span>
                                </span>
                            ) : null}
                        </div>
                    )}
                    <div className="mt-3 min-w-0 w-full flex-1 lg:mt-0 lg:w-auto">
                        <h1
                            data-testid="patient-detail-header-name"
                            className="max-w-full text-lg font-bold leading-tight tracking-[-0.02em] text-slate-950 lg:text-left"
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
                        <div className="mt-2 flex min-w-0 flex-wrap items-center justify-center gap-1.5 lg:justify-start">
                            {visibleCategories.length > 0 ? visibleCategories.map((category, index) => (
                                <Badge
                                    key={category.id}
                                    variant="secondary"
                                    className={`max-w-full truncate border border-transparent text-xs ${index > 0 ? 'lg:hidden' : ''}`}
                                    style={{
                                        backgroundColor: `${category.color}22`,
                                        color: category.color,
                                    }}
                                    title={category.name}
                                >
                                    {truncateForUi(category.name, PATIENT_CATEGORY_CHIP_UI_LIMIT)}
                                </Badge>
                            )) : (
                                <Badge variant="secondary" className="max-w-full truncate bg-slate-100 text-xs text-slate-600">
                                    {t('patients.uncategorized')}
                                </Badge>
                            )}
                            {isPatientArchived ? (
                                <Badge variant="secondary" className="shrink-0 bg-slate-200 text-slate-800">
                                    {t('patients.archived')}
                                </Badge>
                            ) : null}
                            {isInactive ? (
                                <Badge variant="secondary" className="shrink-0 bg-yellow-100 text-yellow-800">
                                    {t('patientDetail.inactive')}
                                </Badge>
                            ) : null}
                        </div>
                        {mobileAppLayout ? (
                            <div
                                data-testid="patient-detail-mobile-vitals"
                                className="mt-3 flex min-w-0 flex-wrap items-center justify-center gap-1.5 lg:hidden"
                            >
                                <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-600">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {t('patientDetail.visitsCount', { count: visitCount })}
                                </span>
                                {patient.last_visit_at ? (
                                    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-600">
                                        <Clock3 className="h-3.5 w-3.5" />
                                        {formatDate(patient.last_visit_at)}
                                    </span>
                                ) : null}
                                {patientAge !== null ? (
                                    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 text-[11px] font-semibold text-slate-600">
                                        <Cake className="h-3.5 w-3.5" />
                                        {t('patientDetail.ageYears', { count: patientAge })}
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>
                <div
                    data-testid="patient-detail-header-facts"
                    className={`order-3 grid h-auto min-w-0 overflow-visible lg:order-none lg:col-span-2 lg:row-start-2 lg:h-[8rem] lg:grid-rows-[1fr_auto_1fr] lg:gap-1.5 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-100 lg:bg-slate-50/70 lg:px-2.5 lg:py-2 xl:col-span-1 xl:col-start-2 xl:row-start-1 ${mobileAppLayout ? 'gap-4' : 'gap-3'}`}
                >
                    <div
                        data-testid="patient-detail-header-contact-facts"
                        className={`grid min-h-0 min-w-0 grid-cols-1 items-center gap-0 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 lg:grid-cols-3 lg:gap-1.5 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${mobileAppLayout ? 'p-0' : 'p-2'}`}
                    >
                        <h2 className={`${mobileAppLayout ? 'border-b border-slate-100 px-3 py-2.5' : 'px-1 pb-1'} text-left text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 lg:sr-only lg:p-0`}>
                            {t('patientDetail.contactInfo')}
                        </h2>
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
                            className="lg:col-span-1 lg:h-11"
                            valueClassName={headerPhones.length > 0 ? '' : 'text-slate-400'}
                            mobileAppLayout={mobileAppLayout}
                        />
                        <PatientHeaderFact
                            icon={Calendar}
                            label={t('patientDetail.birthDate')}
                            value={headerBirthDateValue}
                            title={patient.date_of_birth ? headerBirthDateValue : t('patientDetail.notSpecified')}
                            tone="sky"
                            className="lg:h-11"
                            valueClassName="tabular-nums"
                            mobileAppLayout={mobileAppLayout}
                        />
                        <PatientHeaderFact
                            icon={MapPin}
                            label={t('patientDetail.address')}
                            value={truncateForUi(headerAddressValue, 38)}
                            title={patient.address?.trim() ? patient.address : t('patientDetail.notSpecified')}
                            tone="teal"
                            className="lg:h-11"
                            valueClassName={patient.address?.trim() ? '' : 'text-slate-400'}
                            mobileAppLayout={mobileAppLayout}
                        />
                    </div>
                    <div aria-hidden="true" className="hidden h-px bg-slate-200/70 lg:block" />
                    <div
                        data-testid="patient-detail-header-medical-facts"
                        className={`grid min-h-0 min-w-0 grid-cols-1 items-center gap-0 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 lg:grid-cols-3 lg:gap-1.5 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none ${mobileAppLayout ? 'p-0' : 'p-2'}`}
                    >
                        <h2 className={`${mobileAppLayout ? 'border-b border-slate-100 px-3 py-2.5' : 'px-1 pb-1'} text-left text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 lg:sr-only lg:p-0`}>
                            {t('patientDetail.medicalInfo')}
                        </h2>
                        {hasHeaderMedicalFacts ? (
                            <>
                                <PatientHeaderClinicalFact
                                    icon={AlertCircle}
                                    label={t('patientDetail.allergies')}
                                    value={patient.allergies}
                                    tone="rose"
                                    truncateLimit={PATIENT_ALLERGIES_UI_LIMIT}
                                    emptyLabel={compactEmptyValue}
                                    mobileAppLayout={mobileAppLayout}
                                />
                                <PatientHeaderClinicalFact
                                    icon={Pill}
                                    label={t('patientDetail.currentMedications')}
                                    value={patient.current_medications}
                                    tone="amber"
                                    truncateLimit={PATIENT_MEDICATIONS_UI_LIMIT}
                                    emptyLabel={compactEmptyValue}
                                    mobileAppLayout={mobileAppLayout}
                                />
                                <PatientHeaderClinicalFact
                                    icon={FileText}
                                    label={t('patientDetail.medicalHistory.label')}
                                    value={patient.medical_history}
                                    tone="slate"
                                    truncateLimit={PATIENT_MEDICAL_HISTORY_UI_LIMIT}
                                    emptyLabel={compactEmptyValue}
                                    mobileAppLayout={mobileAppLayout}
                                />
                            </>
                        ) : (
                            <PatientHeaderMedicalEmptyState
                                icon={FileText}
                                label={t('patientDetail.noMedicalInfo')}
                                mobileAppLayout={mobileAppLayout}
                            />
                        )}
                    </div>
                </div>
                <div
                    data-testid="patient-detail-header-actions"
                    className={`order-2 grid min-w-0 grid-flow-col auto-cols-fr items-center gap-2 lg:order-none lg:col-start-2 lg:row-start-1 lg:flex lg:flex-row lg:flex-wrap lg:justify-end lg:gap-2 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none xl:col-start-3 ${mobileAppLayout ? 'px-4 pb-1 pt-3' : 'rounded-2xl border border-white/90 bg-white p-2 shadow-sm shadow-slate-200/50'}`}
                >
                    {mobileAppLayout ? patientPhoneHref ? (
                        <Button
                            asChild
                            variant="outline"
                            size="icon-lg"
                            className="h-11 w-full rounded-xl border-transparent bg-teal-50 px-2 text-[10px] text-teal-800 hover:bg-teal-100 hover:text-teal-900 lg:hidden"
                        >
                            <a href={patientPhoneHref} aria-label={t('patientDetail.callPatient')}>
                                <Phone className="h-4 w-4" />
                                <span className="min-w-0 truncate">{t('patientDetail.callPatient')}</span>
                            </a>
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="h-11 w-full rounded-xl border-transparent bg-slate-100 px-2 text-[10px] text-slate-400 lg:hidden"
                            aria-label={t('patientDetail.callPatient')}
                            disabled
                        >
                            <Phone className="h-4 w-4" />
                            <span className="min-w-0 truncate">{t('patientDetail.callPatient')}</span>
                        </Button>
                    ) : null}
                    {!isPatientArchived && canManageAppointments ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="h-11 w-full rounded-xl border-teal-600 bg-teal-600 px-2 text-[10px] text-white shadow-sm hover:bg-teal-700 hover:text-white lg:size-10 lg:rounded-full lg:border-input lg:bg-background lg:px-0 lg:text-foreground lg:shadow-xs lg:hover:bg-accent lg:hover:text-accent-foreground"
                            aria-label={t('appointments.dialog.newTitle')}
                            title={t('appointments.dialog.newTitle')}
                            onClick={() => setIsAppointmentDialogOpen(true)}
                        >
                            <CalendarPlus className="h-4 w-4" />
                            <span className="min-w-0 truncate lg:sr-only">{t('appointments.dialog.newTitle')}</span>
                        </Button>
                    ) : !isPatientArchived && isSubscriptionReadOnly(currentUser) && canViewAppointments ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="h-11 w-full rounded-xl px-2 text-[10px] lg:size-10 lg:rounded-full lg:px-0"
                            aria-label={t('appointments.dialog.newTitle')}
                            title={t('appointments.dialog.newTitle')}
                            disabled
                            onClick={denyManageAction}
                        >
                            <CalendarPlus className="h-4 w-4" />
                            <span className="min-w-0 truncate lg:sr-only">{t('appointments.dialog.newTitle')}</span>
                        </Button>
                    ) : null}
                    {canManagePatients ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="h-11 w-full rounded-xl border-transparent bg-teal-50 px-2 text-[10px] text-teal-800 hover:bg-teal-100 hover:text-teal-900 lg:size-10 lg:rounded-full lg:border-input lg:bg-background lg:px-0 lg:text-foreground lg:hover:bg-accent lg:hover:text-accent-foreground"
                            aria-label={t('patientDetail.editPatient')}
                            title={t('patientDetail.editPatient')}
                            onClick={() => setIsEditDialogOpen(true)}
                            disabled={isPatientArchived}
                        >
                            <Edit className="h-4 w-4" />
                            <span className="min-w-0 truncate lg:sr-only">{t('patientDetail.editPatient')}</span>
                        </Button>
                    ) : isSubscriptionReadOnly(currentUser) && canViewPatients ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="h-11 w-full rounded-xl px-2 text-[10px] lg:size-10 lg:rounded-full lg:px-0"
                            aria-label={t('patientDetail.editPatient')}
                            title={t('patientDetail.editPatient')}
                            disabled
                            onClick={denyManageAction}
                        >
                            <Edit className="h-4 w-4" />
                            <span className="min-w-0 truncate lg:sr-only">{t('patientDetail.editPatient')}</span>
                        </Button>
                    ) : null}
                    {isPatientArchived ? (
                        <>
                            {canManagePatients ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={`${mobileAppLayout ? 'hidden' : ''} h-10 w-full rounded-xl px-3 text-xs lg:flex lg:h-7 lg:w-auto lg:rounded-full`}
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
                                    className={`${mobileAppLayout ? 'hidden' : ''} h-10 w-full rounded-xl px-3 text-xs lg:flex lg:h-7 lg:w-auto lg:rounded-full`}
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
                                    className={`${mobileAppLayout ? 'hidden' : ''} h-10 w-full rounded-xl px-3 text-xs text-red-600 hover:text-red-700 lg:flex lg:h-7 lg:w-auto lg:rounded-full`}
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
                                    className={`${mobileAppLayout ? 'hidden' : ''} h-10 w-full rounded-xl px-3 text-xs text-red-600 hover:text-red-700 lg:flex lg:h-7 lg:w-auto lg:rounded-full`}
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
                            className={`${mobileAppLayout ? 'hidden' : ''} h-11 w-full rounded-xl border-transparent bg-amber-50 px-2 text-[10px] text-amber-700 hover:bg-amber-100 hover:text-amber-800 lg:flex lg:size-10 lg:rounded-full lg:border-input lg:bg-background lg:px-0 lg:shadow-xs`}
                            aria-label={t('patientDetail.archive')}
                            title={t('patientDetail.archive')}
                            onClick={() => setIsArchivePatientDialogOpen(true)}
                            disabled={archivePatientMutation.isPending}
                        >
                            <Archive className="h-4 w-4" />
                            <span className="min-w-0 truncate lg:sr-only">{t('patientDetail.archive')}</span>
                        </Button>
                    ) : isSubscriptionReadOnly(currentUser) && canViewPatients ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className={`${mobileAppLayout ? 'hidden' : ''} h-11 w-full rounded-xl px-2 text-[10px] text-amber-700 hover:text-amber-800 lg:flex lg:size-10 lg:rounded-full lg:px-0`}
                            aria-label={t('patientDetail.archive')}
                            title={t('patientDetail.archive')}
                            disabled
                            onClick={denyManageAction}
                        >
                            <Archive className="h-4 w-4" />
                            <span className="min-w-0 truncate lg:sr-only">{t('patientDetail.archive')}</span>
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
                                queryKey: queryKeys.patients.overview(patient.id),
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
                        downloadSrc: patient.photo_url ?? patientAvatarPreviewUrl,
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
