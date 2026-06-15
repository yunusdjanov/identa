'use client';

import dynamic from 'next/dynamic';
import { use, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { PatientDetailLoadingState } from '@/components/layout/page-loading-skeletons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    archivePatient,
    deletePatientOralPhoto,
    getCurrentUser,
    getPatient,
    getPatientOverview,
    permanentlyDeletePatient,
    restorePatient,
    uploadPatientOralPhoto,
} from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import {
    formatCurrency,
    formatDate,
    getDaysSinceLastVisit,
    toLocalDateKey,
    truncateForUi,
} from '@/lib/utils';
import { formatLocalizedDate } from '@/lib/i18n/date';
import {
    Activity,
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Calendar,
    CalendarCheck,
    CalendarClock,
    Camera,
    ClipboardList,
    Clock3,
    Contact,
    Edit,
    FileText,
    Hash,
    HeartPulse,
    ImageIcon,
    Loader2,
    Lock,
    MapPin,
    Maximize2,
    Phone,
    Pill,
    Plus,
    Upload,
    Trash2,
    User,
    Wallet,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';
import { useI18n } from '@/components/providers/i18n-provider';
import { getProtectedMediaCrossOrigin, getProtectedMediaPreviewUrl, getProtectedMediaThumbnailUrl } from '@/lib/protected-media';
import { INPUT_LIMITS } from '@/lib/input-validation';
import { optimizeImageFileForUpload } from '@/lib/browser-image';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { canManage, canView, getManageDeniedMessage, isSubscriptionReadOnly } from '@/lib/auth/permissions';
import { getStatusTone } from '@/lib/appointments/status-tone';

const EditPatientDialog = dynamic(
    () => import('@/components/patients/edit-patient-dialog').then((module) => module.EditPatientDialog),
    { ssr: false }
);

const PatientPhotoPreviewDialog = dynamic(
    () => import('@/components/patients/patient-photo-preview-dialog').then((module) => module.PatientPhotoPreviewDialog),
    { ssr: false }
);

const PATIENT_HEADER_NAME_UI_LIMIT = 25;
const PATIENT_CATEGORY_CHIP_UI_LIMIT = 20;
const PATIENT_ALLERGIES_UI_LIMIT = INPUT_LIMITS.medicalAllergies;
const PATIENT_MEDICATIONS_UI_LIMIT = INPUT_LIMITS.medicalMedications;
const PATIENT_MEDICAL_HISTORY_UI_LIMIT = INPUT_LIMITS.medicalHistory;
const DEFAULT_ORAL_PHOTO_UPLOAD_MAX_MB = 1;
const ORAL_PHOTO_UPLOAD_MAX_EDGE = 1600;

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

function computePatientAge(dateOfBirth: string): number {
    const birth = new Date(dateOfBirth);
    if (Number.isNaN(birth.getTime())) {
        return 0;
    }
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return Math.max(0, age);
}

/* ============================================================
   Premium triad helpers — Vitals · Reach · Clinical
   Inspired by Linear/Vercel/Stripe customer detail layouts:
   – top-edge accent gradient strip for category color story
   – icon hexagon with gradient fill + ring
   – micro-uppercase labels (10px / 0.14em tracking)
   – tabular numerals everywhere a number lives
   ============================================================ */

function VitalStatCell({
    icon: Icon,
    label,
    value,
    valueClassName,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    valueClassName?: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-1 bg-white px-3 py-4 text-center">
            <div className="inline-flex items-center gap-1 text-slate-400">
                <Icon className="h-3 w-3" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</p>
            </div>
            <p className={`max-w-full truncate text-[13px] font-semibold tabular-nums text-slate-900 ${valueClassName ?? ''}`} title={value}>
                {value}
            </p>
        </div>
    );
}

function ReachRow({
    icon: Icon,
    label,
    value,
    href,
    multiline = false,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    href?: string;
    multiline?: boolean;
}) {
    const valueNode = (
        <span
            className={`ml-auto max-w-[62%] text-right text-[13px] font-semibold tabular-nums text-slate-900 ${multiline ? 'whitespace-normal break-words' : 'truncate'}`}
            title={value}
        >
            {value}
        </span>
    );

    const inner = (
        <>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-all group-hover/row:bg-teal-100 group-hover/row:text-teal-700">
                <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span>
            {valueNode}
        </>
    );

    const base = 'group/row flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors';
    if (href) {
        return (
            <a href={href} className={`${base} hover:bg-teal-50/70`}>
                {inner}
            </a>
        );
    }
    return <div className={`${base} hover:bg-slate-50`}>{inner}</div>;
}

function ClinicalSection({
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
    const tones = {
        rose: {
            box: 'bg-rose-50/70 ring-rose-100',
            labelText: 'text-rose-700',
            valueText: 'text-rose-900',
            icon: 'text-rose-600',
        },
        amber: {
            box: 'bg-amber-50/70 ring-amber-100',
            labelText: 'text-amber-800',
            valueText: 'text-amber-950',
            icon: 'text-amber-600',
        },
        slate: {
            box: 'bg-slate-50 ring-slate-100',
            labelText: 'text-slate-600',
            valueText: 'text-slate-800',
            icon: 'text-slate-500',
        },
    } as const;
    const t = tones[tone];
    if (!value) {
        return (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                    <Icon className="h-3 w-3 shrink-0 text-slate-400" />
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
                </div>
                <p className="mt-1 text-[11px] italic text-slate-400">{emptyLabel}</p>
            </div>
        );
    }
    return (
        <div className={`rounded-xl px-3 py-2.5 ring-1 ${t.box}`}>
            <div className="flex items-center gap-1.5">
                <Icon className={`h-3 w-3 shrink-0 ${t.icon}`} />
                <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${t.labelText}`}>{label}</p>
            </div>
            <p className={`mt-1 text-[12px] leading-snug ${t.valueText}`}>{truncateForUi(value, truncateLimit)}</p>
        </div>
    );
}

export default function PatientDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const { t, locale } = useI18n();
    const router = useRouter();

    // Inline triad labels — locale-aware so they render correctly even if the
    // browser is still holding the previously cached /api/i18n dictionary
    // (the immutable cache header has been lifted, but legacy entries persist).
    const triadLabels = {
        contact: { ru: 'Контакт', uz: 'Aloqa', en: 'Contact' }[locale] ?? 'Contact',
        clinic: { ru: 'Клиника', uz: 'Klinika', en: 'Clinic' }[locale] ?? 'Clinic',
        detail: { ru: 'Детали', uz: 'Tafsilot', en: 'Detail' }[locale] ?? 'Detail',
    };
    const queryClient = useQueryClient();
    const oralPhotoInputRef = useRef<HTMLInputElement | null>(null);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isArchivePatientDialogOpen, setIsArchivePatientDialogOpen] = useState(false);
    const [isRestorePatientDialogOpen, setIsRestorePatientDialogOpen] = useState(false);
    const [isPermanentDeletePatientDialogOpen, setIsPermanentDeletePatientDialogOpen] = useState(false);
    const [isOralPhotoPreviewOpen, setIsOralPhotoPreviewOpen] = useState(false);
    const [isDeleteOralPhotoDialogOpen, setIsDeleteOralPhotoDialogOpen] = useState(false);
    const [oralPhotoInputKey, setOralPhotoInputKey] = useState(0);
    const todayDateKey = toLocalDateKey();
    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });
    const currentUser = currentUserQuery.data;
    const canViewPatients = canView(currentUser, 'patients');
    const canManagePatients = canManage(currentUser, 'patients');
    const canViewAppointments = canView(currentUser, 'appointments');
    const canManageAppointments = canManage(currentUser, 'appointments');
    const canViewPayments = canView(currentUser, 'payments');
    // AF5: shared deny-toast for buttons we keep disabled because the
    // subscription is read-only (vs. hidden when the assistant simply
    // lacks the permission). Reused by Edit / Archive / Restore / Delete.
    const denyManageAction = () => toast.error(getManageDeniedMessage(currentUser, t));

    const patientQuery = useQuery({
        queryKey: ['patients', 'detail', id],
        queryFn: () => getPatient(id),
        enabled: canViewPatients,
        retry: false,
        staleTime: 30_000,
    });

    const overviewQuery = useQuery({
        queryKey: ['patients', 'detail', id, 'overview', todayDateKey],
        queryFn: () => getPatientOverview(id),
        enabled: canViewPatients,
        staleTime: 30_000,
        gcTime: 300_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const archivePatientMutation = useMutation({
        mutationFn: () => archivePatient(id),
        onSuccess: () => {
            toast.success(t('patientDetail.toast.archived'));
            setIsArchivePatientDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['patients', 'detail', id] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patientDetail.toast.archiveFailed')));
        },
    });

    const restorePatientMutation = useMutation({
        mutationFn: () => restorePatient(id),
        onSuccess: () => {
            toast.success(t('patientDetail.toast.restored'));
            setIsRestorePatientDialogOpen(false);
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['patients', 'detail', id] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patientDetail.toast.restoreFailed')));
        },
    });

    const permanentlyDeletePatientMutation = useMutation({
        mutationFn: () => permanentlyDeletePatient(id),
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

    const uploadOralPhotoMutation = useMutation({
        mutationFn: (photo: File) => uploadPatientOralPhoto(id, photo),
        onSuccess: (updatedPatient) => {
            toast.success(t('patientDetail.toast.oralPhotoUploaded'));
            queryClient.setQueryData(['patients', 'detail', id], updatedPatient);
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['patients', 'detail', id] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.toast.photoUploadFailed')));
        },
        onSettled: () => {
            setOralPhotoInputKey((value) => value + 1);
        },
    });

    const deleteOralPhotoMutation = useMutation({
        mutationFn: () => deletePatientOralPhoto(id),
        onSuccess: (updatedPatient) => {
            toast.success(t('patientDetail.toast.oralPhotoDeleted'));
            setIsDeleteOralPhotoDialogOpen(false);
            setIsOralPhotoPreviewOpen(false);
            queryClient.setQueryData(['patients', 'detail', id], updatedPatient);
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['patients', 'detail', id] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.toast.photoDeleteFailed')));
        },
    });

    const patient = patientQuery.data;
    const patientVisitCount = overviewQuery.data?.visit_count ?? overviewQuery.data?.appointment_count ?? 0;
    const latestVisitDate = patient?.last_visit_at ?? undefined;
    const upcomingAppointments = useMemo(
        () => overviewQuery.data?.upcoming_appointments ?? [],
        [overviewQuery.data]
    );
    const totalBalance = overviewQuery.data?.total_balance ?? 0;
    const isPatientArchived = Boolean(patient?.is_archived);

    if (
        currentUserQuery.isLoading ||
        patientQuery.isLoading ||
        overviewQuery.isLoading
    ) {
        return <PatientDetailLoadingState />;
    }

    if (!canViewPatients) {
        return (
            <AccessDeniedState
                title={t('common.forbiddenTitle')}
                description={t('permissions.deniedDescription')}
                actionHref="/patients"
                actionLabel={t('patientDetail.backToPatients')}
            />
        );
    }

    if (
        currentUserQuery.isError ||
        patientQuery.isError ||
        overviewQuery.isError
    ) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(
                    currentUserQuery.error ||
                        patientQuery.error ||
                        overviewQuery.error,
                    t('patientDetail.error.loadFailed')
                )}
                retryLabel={t('common.retry')}
                onRetry={() => {
                    currentUserQuery.refetch();
                    patientQuery.refetch();
                    overviewQuery.refetch();
                }}
                backHref="/patients"
                backLabel={t('patientDetail.backToPatients')}
            />
        );
    }

    if (!patient) {
        return (
            <AppErrorState
                title={t('patientDetail.notFound')}
                description={t('patientDetail.error.loadFailed')}
                backHref="/patients"
                backLabel={t('patientDetail.backToPatients')}
            />
        );
    }

    const daysSinceVisit = getDaysSinceLastVisit(latestVisitDate);
    const isInactive = daysSinceVisit > 180;
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
    const oralPhoto = patient.oral_photo ?? null;
    const oralPhotoThumbnailUrl = getProtectedMediaThumbnailUrl({
        scanStatus: oralPhoto?.scan_status,
        thumbnailUrl: oralPhoto?.thumbnail_url,
        thumbnailReady: oralPhoto?.thumbnail_ready,
        previewUrl: oralPhoto?.preview_url,
        previewReady: oralPhoto?.preview_ready,
        url: oralPhoto?.url,
        allowFullFallback: true,
    });
    const oralPhotoPreviewUrl = getProtectedMediaPreviewUrl({
        scanStatus: oralPhoto?.scan_status,
        previewUrl: oralPhoto?.preview_url,
        url: oralPhoto?.url,
    }) ?? oralPhotoThumbnailUrl;
    const hasOralPhoto = Boolean(oralPhotoThumbnailUrl);
    const isOralPhotoProcessing = oralPhoto?.scan_status === 'pending' && !hasOralPhoto;
    const isOralPhotoRejected = oralPhoto?.scan_status === 'rejected';
    const oralPhotoUploadMaxMb = currentUser?.subscription?.upload_max_mb ?? DEFAULT_ORAL_PHOTO_UPLOAD_MAX_MB;
    const oralPhotoUploadMaxBytes = oralPhotoUploadMaxMb * 1024 * 1024;
    const handleOralPhotoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedPhoto = event.target.files?.[0] ?? null;
        if (!selectedPhoto || uploadOralPhotoMutation.isPending || isPatientArchived) {
            return;
        }

        if (!selectedPhoto.type.startsWith('image/')) {
            toast.error(t('patients.toast.photoInvalidType'));
            setOralPhotoInputKey((value) => value + 1);
            return;
        }
        if (selectedPhoto.size > oralPhotoUploadMaxBytes) {
            toast.error(t('patients.toast.photoTooLarge', { sizeMb: oralPhotoUploadMaxMb }));
            setOralPhotoInputKey((value) => value + 1);
            return;
        }

        try {
            const optimizedPhoto = await optimizeImageFileForUpload(selectedPhoto, {
                maxEdge: ORAL_PHOTO_UPLOAD_MAX_EDGE,
                targetMaxBytes: null,
            });
            uploadOralPhotoMutation.mutate(optimizedPhoto);
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('patients.toast.photoUploadFailed')));
            setOralPhotoInputKey((value) => value + 1);
        }
    };

    return (
        <div className="space-y-4">
            {/* Patient header */}
            <div className="flex flex-col gap-3 rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm shadow-slate-200/70 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.push('/patients')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Avatar className="h-10 w-10 shrink-0 border border-white shadow-sm shadow-slate-200">
                        {patientAvatarUrl ? (
                            <AvatarImage
                                src={patientAvatarUrl}
                                alt={patient.full_name}
                                crossOrigin={getProtectedMediaCrossOrigin(patientAvatarUrl)}
                            />
                        ) : null}
                        <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-700">
                            {getPatientInitials(patient.full_name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <h1
                            className="max-w-full truncate text-lg font-bold tracking-[-0.02em] text-slate-950"
                            title={patient.full_name}
                        >
                            {truncateForUi(patient.full_name, PATIENT_HEADER_NAME_UI_LIMIT)}
                        </h1>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            {primaryCategory ? (
                                <Badge
                                    variant="secondary"
                                    className="max-w-full border border-transparent text-xs [overflow-wrap:anywhere]"
                                    style={{
                                        backgroundColor: `${primaryCategory.color}22`,
                                        color: primaryCategory.color,
                                    }}
                                    title={primaryCategory.name}
                                >
                                    {truncateForUi(primaryCategory.name, PATIENT_CATEGORY_CHIP_UI_LIMIT)}
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="bg-slate-100 text-xs text-slate-600">
                                    {t('patients.uncategorized')}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                    {/* AF5 header buttons. canManagePatients short-circuits
                        on subscription read-only too (see canManage in
                        permissions.ts) — so we branch:
                          1. permission + active subscription → enabled
                          2. subscription read-only with view perm → disabled+toast
                          3. neither → hide entirely (view-only assistant)
                        The archive/restore/delete trio follow the same
                        pattern with their respective mutation-pending
                        guards retained on the enabled branch. */}
                    {canManagePatients ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-full px-3 text-xs"
                            onClick={() => setIsEditDialogOpen(true)}
                            disabled={isPatientArchived}
                        >
                            <Edit className="mr-1.5 h-3 w-3" />
                            {t('patientDetail.editPatient')}
                        </Button>
                    ) : isSubscriptionReadOnly(currentUser) && canViewPatients ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-full px-3 text-xs"
                            disabled
                            onClick={denyManageAction}
                        >
                            <Edit className="mr-1.5 h-3 w-3" />
                            {t('patientDetail.editPatient')}
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
                            {/* Permanent delete is only offered once the patient is
                                archived — the backend requires archive-first. */}
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
                            size="sm"
                            className="h-7 rounded-full px-3 text-xs text-amber-700 hover:text-amber-800"
                            onClick={() => setIsArchivePatientDialogOpen(true)}
                            disabled={archivePatientMutation.isPending}
                        >
                            {t('patientDetail.archive')}
                        </Button>
                    ) : isSubscriptionReadOnly(currentUser) && canViewPatients ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-full px-3 text-xs text-amber-700 hover:text-amber-800"
                            disabled
                            onClick={denyManageAction}
                        >
                            {t('patientDetail.archive')}
                        </Button>
                    ) : null}
                </div>
            </div>

            {/* ───────────────────────────────────────────────────────────
                ORAL PHOTO — clinical reference image
                Separate from the identity avatar so doctors can inspect
                the mouth profile photo without changing patient identity.
            ─────────────────────────────────────────────────────────── */}
            <article className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
                <input
                    key={oralPhotoInputKey}
                    ref={oralPhotoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    aria-label={t('patientDetail.oralPhoto.upload')}
                    onChange={handleOralPhotoSelection}
                />
                <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            type="button"
                            disabled={!hasOralPhoto}
                            onClick={() => {
                                if (oralPhotoPreviewUrl) {
                                    setIsOralPhotoPreviewOpen(true);
                                }
                            }}
                            className="group relative flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-400 transition hover:border-sky-200 hover:bg-sky-50 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-slate-50"
                            aria-label={t('patientDetail.oralPhoto.view')}
                        >
                            {hasOralPhoto && oralPhotoThumbnailUrl ? (
                                <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={oralPhotoThumbnailUrl}
                                        alt={t('patientDetail.oralPhoto.title')}
                                        crossOrigin={getProtectedMediaCrossOrigin(oralPhotoThumbnailUrl)}
                                        className="h-full w-full object-cover"
                                        decoding="async"
                                    />
                                    <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/25 group-hover:opacity-100">
                                        <Maximize2 className="h-4 w-4" />
                                    </span>
                                </>
                            ) : isOralPhotoProcessing ? (
                                <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
                            ) : (
                                <ImageIcon className="h-6 w-6" />
                            )}
                        </button>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-100">
                                    <Camera className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">
                                        {t('patientDetail.oralPhoto.title')}
                                    </p>
                                    <p className="mt-0.5 text-xs text-slate-500">
                                        {hasOralPhoto
                                            ? t('patientDetail.oralPhoto.ready')
                                            : isOralPhotoProcessing
                                                ? t('patientDetail.oralPhoto.processing')
                                                : isOralPhotoRejected
                                                    ? t('patientDetail.oralPhoto.rejected')
                                                    : t('patientDetail.oralPhoto.empty')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {hasOralPhoto && oralPhotoPreviewUrl ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-full px-3 text-xs"
                                onClick={() => setIsOralPhotoPreviewOpen(true)}
                            >
                                <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                                {t('patientDetail.oralPhoto.view')}
                            </Button>
                        ) : null}
                        {canManagePatients ? (
                            <Button
                                type="button"
                                variant={hasOralPhoto ? 'outline' : 'default'}
                                size="sm"
                                className="h-8 rounded-full px-3 text-xs"
                                disabled={isPatientArchived || uploadOralPhotoMutation.isPending || deleteOralPhotoMutation.isPending}
                                onClick={() => oralPhotoInputRef.current?.click()}
                            >
                                {uploadOralPhotoMutation.isPending ? (
                                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                {hasOralPhoto ? t('patientDetail.oralPhoto.replace') : t('patientDetail.oralPhoto.upload')}
                            </Button>
                        ) : isSubscriptionReadOnly(currentUser) && canViewPatients ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-full px-3 text-xs"
                                disabled
                                onClick={denyManageAction}
                            >
                                <Upload className="mr-1.5 h-3.5 w-3.5" />
                                {hasOralPhoto ? t('patientDetail.oralPhoto.replace') : t('patientDetail.oralPhoto.upload')}
                            </Button>
                        ) : null}
                        {canManagePatients && oralPhoto ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-full px-3 text-xs text-red-600 hover:text-red-700"
                                disabled={isPatientArchived || uploadOralPhotoMutation.isPending || deleteOralPhotoMutation.isPending}
                                onClick={() => setIsDeleteOralPhotoDialogOpen(true)}
                            >
                                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                                {t('common.delete')}
                            </Button>
                        ) : null}
                    </div>
                </div>
            </article>

            {/* Premium triad: Contact · Clinic · Detail */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">

                {/* ── CARD 1 · CONTACT — click-to-call essentials ── */}
                <article className="group/card relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/70">
                    <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />
                    <header className="flex items-center gap-2.5 px-4 pt-4 pb-2">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 text-teal-600 ring-1 ring-teal-100/80 shadow-sm shadow-teal-100/40">
                            <Contact className="h-4 w-4" strokeWidth={2.25} />
                        </span>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">{triadLabels.contact}</p>
                    </header>
                    <div className="space-y-0.5 px-2 pb-3">
                        {patient.phone ? (
                            <ReachRow
                                icon={Phone}
                                label={t('patientDetail.phone')}
                                value={patient.phone}
                                href={`tel:${patient.phone.replace(/\s/g, '')}`}
                            />
                        ) : null}
                        {patient.secondary_phone ? (
                            <ReachRow
                                icon={Phone}
                                label={t('patientDetail.phone2')}
                                value={patient.secondary_phone}
                                href={`tel:${patient.secondary_phone.replace(/\s/g, '')}`}
                            />
                        ) : null}
                        {patient.address ? (
                            <ReachRow
                                icon={MapPin}
                                label={t('patientDetail.address')}
                                value={patient.address}
                                multiline
                            />
                        ) : null}
                        {patient.date_of_birth ? (
                            <ReachRow
                                icon={Calendar}
                                label={t('patientDetail.birthDate')}
                                value={formatDate(patient.date_of_birth)}
                            />
                        ) : null}
                    </div>
                </article>

                {/* ── CARD 2 · CLINIC — medical record (allergy-aware) ── */}
                <article className={`group/card relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${patient.allergies ? 'border-rose-200/70 shadow-rose-100/40 hover:shadow-rose-200/70' : 'border-slate-200/80 shadow-slate-200/40 hover:shadow-slate-200/70'}`}>
                    <div className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${patient.allergies ? 'from-rose-400 via-red-400 to-orange-400' : 'from-violet-400 via-purple-400 to-fuchsia-400'}`} />
                    <header className="flex items-center gap-2.5 px-4 pt-4 pb-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ring-1 shadow-sm ${patient.allergies ? 'from-rose-50 to-red-50 text-rose-600 ring-rose-100/80 shadow-rose-100/40' : 'from-violet-50 to-purple-50 text-violet-600 ring-violet-100/80 shadow-violet-100/40'}`}>
                            <HeartPulse className="h-4 w-4" strokeWidth={2.25} />
                        </span>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">{triadLabels.clinic}</p>
                    </header>
                    <div className="space-y-1.5 px-3 pb-3">
                        {!patient.allergies && !patient.current_medications && !patient.medical_history ? (
                            <EmptyState icon={HeartPulse} title={t('patientDetail.noMedicalInfo')} size="sm" />
                        ) : (
                            <>
                                {patient.allergies ? (
                                    <ClinicalSection
                                        icon={AlertCircle}
                                        label={t('patientDetail.allergies')}
                                        value={patient.allergies}
                                        tone="rose"
                                        truncateLimit={PATIENT_ALLERGIES_UI_LIMIT}
                                        emptyLabel={t('patientDetail.notSpecified')}
                                    />
                                ) : null}
                                {patient.current_medications ? (
                                    <ClinicalSection
                                        icon={Pill}
                                        label={t('patientDetail.currentMedications')}
                                        value={patient.current_medications}
                                        tone="amber"
                                        truncateLimit={PATIENT_MEDICATIONS_UI_LIMIT}
                                        emptyLabel={t('patientDetail.notSpecified')}
                                    />
                                ) : null}
                                {patient.medical_history ? (
                                    <ClinicalSection
                                        icon={FileText}
                                        label={t('patientDetail.medicalHistory.label')}
                                        value={patient.medical_history}
                                        tone="slate"
                                        truncateLimit={PATIENT_MEDICAL_HISTORY_UI_LIMIT}
                                        emptyLabel={t('patientDetail.notSpecified')}
                                    />
                                ) : null}
                            </>
                        )}
                    </div>
                </article>

                {/* ── CARD 3 · DETAIL — activity & balance snapshot ── */}
                <article className="group/card relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/70">
                    <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-teal-400 via-sky-400 to-indigo-400" />
                    <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-sky-50 text-teal-600 ring-1 ring-teal-100/80 shadow-sm shadow-teal-100/40">
                                <Activity className="h-4 w-4" strokeWidth={2.25} />
                            </span>
                            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">{triadLabels.detail}</p>
                        </div>
                        {isInactive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700 ring-1 ring-amber-100">
                                <Clock3 className="h-2.5 w-2.5" />
                                {daysSinceVisit}d
                            </span>
                        ) : null}
                    </header>
                    <div className="mx-px grid flex-1 grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-b-2xl bg-slate-100/70">
                        <VitalStatCell
                            icon={Wallet}
                            label={t('patientDetail.openBalance')}
                            value={!canViewPayments ? '—' : totalBalance > 0 ? formatCurrency(totalBalance) : t('payments.paid')}
                            valueClassName={!canViewPayments ? 'text-slate-700' : totalBalance > 0 ? 'text-red-700' : 'text-emerald-700'}
                        />
                        <VitalStatCell
                            icon={Hash}
                            label={t('patientDetail.totalAppointments')}
                            value={String(patientVisitCount)}
                        />
                        <VitalStatCell
                            icon={CalendarCheck}
                            label={t('patientDetail.lastVisit')}
                            value={latestVisitDate ? formatDate(latestVisitDate) : t('patients.never')}
                        />
                        <VitalStatCell
                            icon={User}
                            label={t('patientDetail.age')}
                            value={patient.date_of_birth ? t('patientDetail.years', { count: computePatientAge(patient.date_of_birth) }) : '—'}
                        />
                    </div>
                </article>

            </div>

            {/* ───────────────────────────────────────────────────────────
                APPOINTMENTS — sister card to the triad
                Same shape language (gradient strip · hexagon icon · hover lift)
                but with its own indigo→violet color story for "scheduling".
            ─────────────────────────────────────────────────────────── */}
            <article className="group/card relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 transition-all hover:shadow-md hover:shadow-slate-200/70">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400" />
                <header className="flex flex-col gap-3 border-b border-slate-100/80 px-4 pt-4 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-50 to-indigo-50 text-indigo-600 ring-1 ring-indigo-100/80 shadow-sm shadow-indigo-100/40">
                            <CalendarClock className="h-4 w-4" strokeWidth={2.25} />
                        </span>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">{t('appointments.title')}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Link
                            href={`/patients/${id}/history?from=patients`}
                            className="group/link inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-3 text-[11px] font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm"
                        >
                            <ClipboardList className="h-3.5 w-3.5 text-slate-500" />
                            {t('patientHistory.title')}
                            <ArrowRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-hover/link:translate-x-0.5" />
                        </Link>
                        {/* AF5 — schedule CTA hidden for view-only assistants
                            (no canManageAppointments). The Link wrapper used
                            to ship even when disabled, which kept the URL
                            reachable via Cmd-click; conditionally rendering
                            the entire affordance closes that escape hatch.
                            Subscription read-only keeps the disabled
                            button + toast pattern. */}
                        {canManageAppointments ? (
                            <Link href={`/appointments?action=new&patientId=${encodeURIComponent(id)}`}>
                                <Button size="sm" className="h-8 rounded-full px-3 text-[11px] font-semibold shadow-sm shadow-slate-900/10">
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    {t('dashboard.scheduleAppointment')}
                                </Button>
                            </Link>
                        ) : isSubscriptionReadOnly(currentUser) && canViewAppointments ? (
                            <Button
                                size="sm"
                                className="h-8 rounded-full px-3 text-[11px] font-semibold shadow-sm shadow-slate-900/10"
                                disabled
                                onClick={denyManageAction}
                            >
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                {t('dashboard.scheduleAppointment')}
                            </Button>
                        ) : null}
                    </div>
                </header>
                <div>
                    {!canViewAppointments ? (
                        <EmptyState icon={Lock} title={t('permissions.deniedTitle')} size="sm" />
                    ) : upcomingAppointments.length === 0 ? (
                        <EmptyState icon={CalendarCheck} title={t('patientDetail.noUpcomingAppointments')} size="sm" />
                    ) : (
                        <ul className="divide-y divide-slate-100/70">
                            {upcomingAppointments.map((appointment) => {
                                const translatedStatus = t(`status.${appointment.status}`);
                                const statusLabel = translatedStatus.startsWith('status.') ? appointment.status : translatedStatus;
                                const statusTone = getStatusTone(appointment.status);
                                const treatmentTitle = appointment.notes?.split('|')[0]?.trim() || t('appointments.general');
                                return (
                                    <li
                                        key={appointment.id}
                                        className="group/row relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/60"
                                    >
                                        {/* Accent rail — slim status-toned bar on the left edge */}
                                        <span className={`absolute inset-y-2 left-0 w-[3px] rounded-r-full opacity-0 transition-opacity group-hover/row:opacity-100 ${statusTone.dot}`} />

                                        {/* Time chip — gradient + ring + tabular nums */}
                                        <time className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-sky-50 to-indigo-50 ring-1 ring-indigo-100/80 shadow-sm shadow-indigo-100/30">
                                            <span className="text-[13px] font-bold tabular-nums leading-none text-indigo-700">
                                                {appointment.start_time?.slice(0, 5)}
                                            </span>
                                            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-400">
                                                {formatLocalizedDate(appointment.appointment_date, locale, { month: 'short', day: 'numeric' })}
                                            </span>
                                        </time>

                                        {/* Treatment + meta */}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-semibold text-slate-900" title={treatmentTitle}>
                                                {treatmentTitle}
                                            </p>
                                            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                                                <Calendar className="h-3 w-3" />
                                                <span className="tabular-nums">{formatDate(appointment.appointment_date)}</span>
                                            </p>
                                        </div>

                                        {/* Status pill — dotted, soft */}
                                        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ring-1 ring-slate-100 ${statusTone.text}`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${statusTone.dot}`} />
                                            {statusLabel}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </article>

            {isEditDialogOpen && canManagePatients ? (
                <EditPatientDialog
                    key={`${patient.id}-open`}
                    open={isEditDialogOpen}
                    onOpenChange={setIsEditDialogOpen}
                    patient={patient}
                    uploadMaxMb={currentUser?.subscription?.upload_max_mb}
                />
            ) : null}

            {oralPhotoPreviewUrl ? (
                <PatientPhotoPreviewDialog
                    open={isOralPhotoPreviewOpen}
                    onOpenChange={setIsOralPhotoPreviewOpen}
                    src={oralPhotoPreviewUrl}
                    alt={t('patientDetail.oralPhoto.title')}
                    title={t('patientDetail.oralPhoto.title')}
                />
            ) : null}

            <ConfirmActionDialog
                open={isDeleteOralPhotoDialogOpen}
                onOpenChange={setIsDeleteOralPhotoDialogOpen}
                title={t('patientDetail.oralPhoto.deleteTitle')}
                description={t('patientDetail.oralPhoto.deleteDescription', { patientName: patient.full_name })}
                confirmLabel={t('common.delete')}
                pendingLabel={t('payments.deleting')}
                confirmVariant="destructive"
                isPending={deleteOralPhotoMutation.isPending}
                onConfirm={() => deleteOralPhotoMutation.mutate()}
            />

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
        </div>
    );
}
