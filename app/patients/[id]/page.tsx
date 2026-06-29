'use client';

import dynamic from 'next/dynamic';
import { use, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { PatientDetailLoadingState } from '@/components/layout/page-loading-skeletons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
    archivePatient,
    deletePatientOralPhoto,
    getCurrentUser,
    getPatient,
    getPatientOverview,
    permanentlyDeletePatient,
    replacePatientOralPhoto,
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
import {
    Activity,
    AlertCircle,
    ArrowLeft,
    Calendar,
    CalendarCheck,
    CalendarPlus,
    Camera,
    Clock3,
    Edit,
    FileText,
    Hash,
    Info,
    Loader2,
    MapPin,
    Maximize2,
    Phone,
    Pill,
    Plus,
    Trash2,
    User,
    Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/components/providers/i18n-provider';
import { getProtectedMediaCrossOrigin, getProtectedMediaPreviewUrl, getProtectedMediaThumbnailUrl } from '@/lib/protected-media';
import { INPUT_LIMITS } from '@/lib/input-validation';
import { optimizeImageFileForUpload } from '@/lib/browser-image';
import type { ApiPatient, ApiPatientClinicalPhotoViewType } from '@/lib/api/types';
import type { PreviewGalleryImage } from '@/components/patients/patient-photo-preview-dialog';
import {
    getPatientOralPhotoGallery,
    hasPendingOralPhotoProcessing,
    ORAL_PHOTO_MAX_PER_SLOT,
    ORAL_PHOTO_POLL_INTERVAL_MS,
    ORAL_PHOTO_SLOTS,
} from '@/lib/patients/oral-photos';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { canManage, canView, getManageDeniedMessage, isSubscriptionReadOnly } from '@/lib/auth/permissions';
import { PATIENTS_LIST_RESTORE_HREF } from '@/lib/patients/patient-list-state';

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

const TreatmentHistoryCard = dynamic(
    () => import('@/components/patients/treatment-history-card').then((module) => module.TreatmentHistoryCard),
    {
        ssr: false,
        loading: () => <Skeleton className="h-[28rem] w-full rounded-2xl" />,
    }
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

function BasicInfoCell({
    icon: Icon,
    label,
    children,
}: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 gap-3 px-1.5 py-1">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600 ring-1 ring-teal-100/80">
                <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">{label}</p>
                <div className="mt-1 min-w-0 text-[13px] font-semibold leading-5 text-slate-900">
                    {children}
                </div>
            </div>
        </div>
    );
}

/**
 * Render one compact medical fact without expanding the profile summary grid.
 */
function CompactClinicalFact({
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
            box: 'bg-rose-50/70 text-rose-700 ring-rose-100',
            labelText: 'text-rose-700',
            valueText: 'text-rose-900',
            icon: 'text-rose-600',
        },
        amber: {
            box: 'bg-amber-50/70 text-amber-700 ring-amber-100',
            labelText: 'text-amber-800',
            valueText: 'text-amber-950',
            icon: 'text-amber-600',
        },
        slate: {
            box: 'bg-slate-50 text-slate-600 ring-slate-100',
            labelText: 'text-slate-600',
            valueText: 'text-slate-800',
            icon: 'text-slate-500',
        },
    } as const;
    const t = tones[tone];
    const hasValue = Boolean(value);
    const safeValue = value ?? '';
    const displayValue = hasValue ? truncateForUi(safeValue, truncateLimit) : emptyLabel;

    return (
        <div className={`min-w-0 rounded-xl px-3 py-2 ring-1 ${t.box}`}>
            <div className="flex min-w-0 items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${t.icon}`} />
                <span className={`min-w-0 truncate text-[10px] font-bold uppercase tracking-[0.08em] ${t.labelText}`}>
                    {label}
                </span>
            </div>
            <span
                className={`mt-1 block min-w-0 truncate text-[12px] font-semibold ${hasValue ? t.valueText : 'text-slate-400'}`}
                title={hasValue ? safeValue : emptyLabel}
            >
                {displayValue}
            </span>
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
    const searchParams = useSearchParams();
    const shouldRememberRecent = searchParams.get('remember_recent') === '1';

    // Inline triad labels — locale-aware so they render correctly even if the
    // browser is still holding the previously cached /api/i18n dictionary
    // (the immutable cache header has been lifted, but legacy entries persist).
    const triadLabels = {
        detail: { ru: 'Детали', uz: 'Tafsilot', en: 'Detail' }[locale] ?? 'Detail',
    };
    const queryClient = useQueryClient();
    const oralPhotoInputRef = useRef<HTMLInputElement | null>(null);
    const oralPhotoUploadViewTypeRef = useRef<ApiPatientClinicalPhotoViewType>('smile');
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isAppointmentDialogOpen, setIsAppointmentDialogOpen] = useState(false);
    const [isArchivePatientDialogOpen, setIsArchivePatientDialogOpen] = useState(false);
    const [isRestorePatientDialogOpen, setIsRestorePatientDialogOpen] = useState(false);
    const [isPermanentDeletePatientDialogOpen, setIsPermanentDeletePatientDialogOpen] = useState(false);
    const [isPatientPhotoPreviewOpen, setIsPatientPhotoPreviewOpen] = useState(false);
    const [oralPhotoPreviewTarget, setOralPhotoPreviewTarget] = useState<{
        viewType: ApiPatientClinicalPhotoViewType;
        photoId: string;
    } | null>(null);
    const [deleteOralPhotoTarget, setDeleteOralPhotoTarget] = useState<{
        viewType: ApiPatientClinicalPhotoViewType;
        photoId: string;
    } | null>(null);
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
        queryKey: ['patients', 'detail', id, { rememberRecent: shouldRememberRecent }],
        queryFn: () => getPatient(id, { rememberRecent: shouldRememberRecent }),
        enabled: canViewPatients,
        retry: false,
        staleTime: 30_000,
        refetchInterval: (query) => hasPendingOralPhotoProcessing(query.state.data as ApiPatient | undefined)
            ? ORAL_PHOTO_POLL_INTERVAL_MS
            : false,
        refetchIntervalInBackground: true,
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
        mutationFn: ({ photo, viewType }: { photo: File; viewType: ApiPatientClinicalPhotoViewType }) =>
            uploadPatientOralPhoto(id, photo, viewType),
        onSuccess: (updatedPatient) => {
            toast.success(t(
                hasPendingOralPhotoProcessing(updatedPatient)
                    ? 'patientDetail.toast.oralPhotoProcessing'
                    : 'patientDetail.toast.oralPhotoUploaded'
            ));
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

    const replaceOralPhotoMutation = useMutation({
        mutationFn: ({ photo, viewType, photoId }: { photo: File; viewType: ApiPatientClinicalPhotoViewType; photoId: string }) =>
            replacePatientOralPhoto(id, viewType, photoId, photo),
        onSuccess: (updatedPatient) => {
            toast.success(t(
                hasPendingOralPhotoProcessing(updatedPatient)
                    ? 'patientDetail.toast.oralPhotoProcessing'
                    : 'patientHistory.toast.imageEdited'
            ));
            queryClient.setQueryData(['patients', 'detail', id], updatedPatient);
            queryClient.invalidateQueries({ queryKey: ['patients'] });
            queryClient.invalidateQueries({ queryKey: ['patients', 'detail', id] });
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('patients.toast.photoUploadFailed')));
        },
    });

    const deleteOralPhotoMutation = useMutation({
        mutationFn: ({ viewType, photoId }: { viewType: ApiPatientClinicalPhotoViewType; photoId: string }) =>
            deletePatientOralPhoto(id, viewType, photoId),
        onSuccess: (updatedPatient) => {
            toast.success(t('patientDetail.toast.oralPhotoDeleted'));
            setDeleteOralPhotoTarget(null);
            setOralPhotoPreviewTarget(null);
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
    const isInactive = Number.isFinite(daysSinceVisit) && daysSinceVisit > 180;
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
    const oralPhotoSlots = ORAL_PHOTO_SLOTS.map((slot) => {
        const photos = getPatientOralPhotoGallery(patient, slot.viewType).map((photo, index) => {
            const thumbnailUrl = getProtectedMediaThumbnailUrl({
                scanStatus: photo.scan_status,
                thumbnailUrl: photo.thumbnail_url,
                thumbnailReady: photo.thumbnail_ready,
                previewUrl: photo.preview_url,
                previewReady: photo.preview_ready,
                url: photo.url,
                allowFullFallback: true,
            });
            const previewUrl = getProtectedMediaPreviewUrl({
                scanStatus: photo.scan_status,
                previewUrl: photo.preview_url,
                url: photo.url,
            }) ?? thumbnailUrl;

            return {
                photo,
                index,
                thumbnailUrl,
                previewUrl,
                hasPhoto: Boolean(thumbnailUrl),
                isProcessing: photo.scan_status === 'pending' && !thumbnailUrl,
                isRejected: photo.scan_status === 'rejected',
            };
        });
        const displayPhoto = photos.find((photo) => photo.thumbnailUrl) ?? photos[0] ?? null;

        return {
            ...slot,
            photos,
            photo: displayPhoto?.photo ?? null,
            thumbnailUrl: displayPhoto?.thumbnailUrl ?? null,
            previewUrl: displayPhoto?.previewUrl ?? null,
            hasPhoto: photos.some((photo) => photo.hasPhoto),
            isProcessing: photos.some((photo) => photo.isProcessing),
            isRejected: photos.some((photo) => photo.isRejected),
        };
    });
    const smileOralPhotoSlot = oralPhotoSlots.find((slot) => slot.viewType === 'smile') ?? null;
    const smileOralPhotoPhotos = smileOralPhotoSlot?.photos ?? [];
    const smileOralPhotoReadyCount = smileOralPhotoPhotos.filter((photo) => photo.hasPhoto).length;
    const smileOralPhotoPlaceholders = Array.from(
        { length: ORAL_PHOTO_MAX_PER_SLOT },
        (_, index) => smileOralPhotoPhotos[index] ?? null
    );
    const oralPhotoPreviewSlot = oralPhotoSlots.find((slot) => slot.viewType === oralPhotoPreviewTarget?.viewType) ?? null;
    const oralPhotoPreviewLabel = oralPhotoPreviewSlot
        ? t(oralPhotoPreviewSlot.labelKey)
        : t('patientDetail.oralPhoto.title');
    const oralPhotoPreviewImages = oralPhotoPreviewSlot?.photos
        .filter((photo) => photo.previewUrl)
        .map((photo) => ({
            id: photo.photo.id,
            src: photo.previewUrl ?? '',
            thumbnailSrc: photo.thumbnailUrl ?? photo.previewUrl ?? undefined,
            alt: `${oralPhotoPreviewLabel} ${photo.index + 1}`,
            title: `${oralPhotoPreviewLabel} ${photo.index + 1}`,
        })) ?? [];
    const oralPhotoPreviewStartIndex = Math.max(
        oralPhotoPreviewImages.findIndex((photo) => photo.id === oralPhotoPreviewTarget?.photoId),
        0
    );
    const deleteOralPhotoSlot = oralPhotoSlots.find((slot) => slot.viewType === deleteOralPhotoTarget?.viewType) ?? null;
    const oralPhotoUploadMaxMb = currentUser?.subscription?.upload_max_mb ?? DEFAULT_ORAL_PHOTO_UPLOAD_MAX_MB;
    const oralPhotoUploadMaxBytes = oralPhotoUploadMaxMb * 1024 * 1024;
    const isOralPhotoMutationPending = uploadOralPhotoMutation.isPending || deleteOralPhotoMutation.isPending;
    const pickOralPhoto = (viewType: ApiPatientClinicalPhotoViewType) => {
        const slot = oralPhotoSlots.find((candidate) => candidate.viewType === viewType);
        if ((slot?.photos.length ?? 0) >= ORAL_PHOTO_MAX_PER_SLOT) {
            return;
        }

        oralPhotoUploadViewTypeRef.current = viewType;
        oralPhotoInputRef.current?.click();
    };
    const handleOralPhotoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedPhoto = event.target.files?.[0] ?? null;
        const viewType = oralPhotoUploadViewTypeRef.current;
        if (!selectedPhoto || uploadOralPhotoMutation.isPending || isPatientArchived) {
            return;
        }
        const uploadSlot = oralPhotoSlots.find((slot) => slot.viewType === viewType);
        if ((uploadSlot?.photos.length ?? 0) >= ORAL_PHOTO_MAX_PER_SLOT) {
            setOralPhotoInputKey((value) => value + 1);
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
            uploadOralPhotoMutation.mutate({ photo: optimizedPhoto, viewType });
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('patients.toast.photoUploadFailed')));
            setOralPhotoInputKey((value) => value + 1);
        }
    };
    const saveEditedOralPhoto = async (image: PreviewGalleryImage, editedPhoto: File) => {
        const viewType = oralPhotoPreviewTarget?.viewType;
        if (!viewType || isPatientArchived || !canManagePatients) {
            return;
        }

        if (!image.id) {
            throw new Error(t('gallery.edit.failed'));
        }

        const optimizedPhoto = await optimizeImageFileForUpload(editedPhoto, {
            maxEdge: ORAL_PHOTO_UPLOAD_MAX_EDGE,
            targetMaxBytes: oralPhotoUploadMaxBytes,
        });

        if (optimizedPhoto.size > oralPhotoUploadMaxBytes) {
            throw new Error(t('patients.toast.photoTooLarge', { sizeMb: oralPhotoUploadMaxMb }));
        }

        await replaceOralPhotoMutation.mutateAsync({
            photo: optimizedPhoto,
            viewType,
            photoId: image.id,
        });
    };

    return (
        <div className="space-y-4">
            {/* Patient header */}
            <div className="flex flex-col gap-3 rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm shadow-slate-200/70 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-3">
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
                        <button
                            type="button"
                            className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-white bg-white p-0 shadow-sm shadow-slate-200 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                            aria-label={`${t('patients.form.photo')}: ${patient.full_name}`}
                            onClick={() => setIsPatientPhotoPreviewOpen(true)}
                        >
                            <Avatar className="h-full w-full">
                                <AvatarImage
                                    src={patientAvatarUrl}
                                    alt={patient.full_name}
                                    crossOrigin={getProtectedMediaCrossOrigin(patientAvatarUrl)}
                                />
                                <AvatarFallback className="bg-slate-100 text-sm font-semibold text-slate-700">
                                    {getPatientInitials(patient.full_name)}
                                </AvatarFallback>
                            </Avatar>
                            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100 group-focus-visible:bg-slate-950/35 group-focus-visible:opacity-100">
                                <Maximize2 className="h-4 w-4" />
                            </span>
                        </button>
                    ) : (
                        <Avatar className="h-16 w-16 shrink-0 border border-white bg-slate-100 shadow-sm shadow-slate-200">
                            <AvatarFallback className="bg-slate-100 text-sm font-semibold text-slate-700">
                                {getPatientInitials(patient.full_name)}
                            </AvatarFallback>
                        </Avatar>
                    )}
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
                    {!isPatientArchived && canManageAppointments ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-full px-3 text-xs"
                            onClick={() => setIsAppointmentDialogOpen(true)}
                        >
                            <CalendarPlus className="mr-1.5 h-3 w-3" />
                            {t('appointments.dialog.newTitle')}
                        </Button>
                    ) : !isPatientArchived && isSubscriptionReadOnly(currentUser) && canViewAppointments ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-full px-3 text-xs"
                            disabled
                            onClick={denyManageAction}
                        >
                            <CalendarPlus className="mr-1.5 h-3 w-3" />
                            {t('appointments.dialog.newTitle')}
                        </Button>
                    ) : null}
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

            {/* Shared hidden input for oral photo slot uploads. */}
            <div className="hidden">
                <input
                    key={oralPhotoInputKey}
                    ref={oralPhotoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    aria-label={t('patientDetail.oralPhoto.upload')}
                    onChange={handleOralPhotoSelection}
                />
            </div>

            {/* Premium summary cards: basic info, oral photo, detail. */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">

                {/* Basic info: contact essentials with stable clinical notes. */}
                <article className="group/card relative flex h-[18.5rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/70 md:col-span-2 xl:col-span-2">
                    <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />
                    <header className="flex items-center gap-2.5 px-5 pb-2.5 pt-4">
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 text-teal-600 ring-1 ring-teal-100/80 shadow-sm shadow-teal-100/40">
                            <Info className="h-4 w-4" strokeWidth={2.25} />
                        </span>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">{t('patients.section.basicInfo')}</p>
                    </header>
                    <div data-testid="patient-detail-contact-card" className="flex min-h-0 flex-1 flex-col px-5 pb-4">
                        <div className="grid min-h-[5.9rem] grid-cols-1 gap-3 border-b border-slate-100 pb-3 sm:grid-cols-3">
                            <BasicInfoCell icon={Phone} label={t('patientDetail.phone')}>
                                <div className="space-y-0.5">
                                    {patient.phone ? (
                                        <a
                                            href={`tel:${patient.phone.replace(/\s/g, '')}`}
                                            className="block truncate tabular-nums hover:text-teal-700"
                                            title={patient.phone}
                                        >
                                            {patient.phone}
                                        </a>
                                    ) : null}
                                    {patient.secondary_phone ? (
                                        <a
                                            href={`tel:${patient.secondary_phone.replace(/\s/g, '')}`}
                                            className="block truncate tabular-nums hover:text-teal-700"
                                            title={patient.secondary_phone}
                                        >
                                            {patient.secondary_phone}
                                        </a>
                                    ) : null}
                                    {!patient.phone && !patient.secondary_phone ? (
                                        <span className="text-slate-400">{t('patientDetail.notSpecified')}</span>
                                    ) : null}
                                </div>
                            </BasicInfoCell>
                            <BasicInfoCell icon={MapPin} label={t('patientDetail.address')}>
                                <p className="line-clamp-2 break-words" title={patient.address ?? t('patientDetail.notSpecified')}>
                                    {patient.address || t('patientDetail.notSpecified')}
                                </p>
                            </BasicInfoCell>
                            <BasicInfoCell icon={Calendar} label={t('patientDetail.birthDate')}>
                                <p className="truncate tabular-nums" title={patient.date_of_birth ? formatDate(patient.date_of_birth) : t('patientDetail.notSpecified')}>
                                    {patient.date_of_birth ? formatDate(patient.date_of_birth) : t('patientDetail.notSpecified')}
                                </p>
                            </BasicInfoCell>
                        </div>
                        <div
                            data-testid="patient-detail-clinical-facts"
                            className="grid min-h-0 flex-1 grid-cols-1 gap-2 pt-3 sm:grid-cols-3"
                        >
                            <CompactClinicalFact
                                icon={AlertCircle}
                                label={t('patientDetail.allergies')}
                                value={patient.allergies}
                                tone="rose"
                                truncateLimit={PATIENT_ALLERGIES_UI_LIMIT}
                                emptyLabel={t('patientDetail.notSpecified')}
                            />
                            <CompactClinicalFact
                                icon={Pill}
                                label={t('patientDetail.currentMedications')}
                                value={patient.current_medications}
                                tone="amber"
                                truncateLimit={PATIENT_MEDICATIONS_UI_LIMIT}
                                emptyLabel={t('patientDetail.notSpecified')}
                            />
                            <CompactClinicalFact
                                icon={FileText}
                                label={t('patientDetail.medicalHistory.label')}
                                value={patient.medical_history}
                                tone="slate"
                                truncateLimit={PATIENT_MEDICAL_HISTORY_UI_LIMIT}
                                emptyLabel={t('patientDetail.notSpecified')}
                            />
                        </div>
                    </div>
                </article>

                {/* Oral photo: compact clinical photo shortcuts */}
                <article className="group/card relative flex h-[18.5rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/70 md:col-span-2 xl:col-span-2">
                    <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-slate-200 via-slate-300 to-slate-400" />
                    <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-500 ring-1 ring-slate-100/80 shadow-sm shadow-slate-100/40">
                                <Camera className="h-4 w-4" strokeWidth={2.25} />
                            </span>
                            <p className="truncate text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">
                                {t('patientDetail.oralPhoto.title')}
                            </p>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-100">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            <span className="tabular-nums">{smileOralPhotoReadyCount}/{ORAL_PHOTO_MAX_PER_SLOT}</span>
                        </span>
                    </header>
                    <div className="flex flex-1 px-4 py-3">
                        <div className="grid flex-1 grid-cols-2 grid-rows-4 gap-2.5 sm:grid-cols-4 sm:grid-rows-2">
                            {smileOralPhotoPlaceholders.map((photoSlot, index) => {
                                const isUploadingSlot = uploadOralPhotoMutation.isPending
                                    && uploadOralPhotoMutation.variables?.viewType === 'smile';
                                const canUploadOralPhoto = canManagePatients
                                    && !isPatientArchived
                                    && !isOralPhotoMutationPending
                                    && smileOralPhotoPhotos.length < ORAL_PHOTO_MAX_PER_SLOT;
                                const slotLabel = `${t('patientDetail.oralPhoto.title')} ${index + 1}`;
                                const hasRenderablePhoto = Boolean(photoSlot?.thumbnailUrl);
                                const previewPhoto = photoSlot?.previewUrl ? photoSlot : null;

                                return (
                                    <button
                                        key={photoSlot?.photo.id ?? `empty-smile-${index}`}
                                        type="button"
                                        disabled={!hasRenderablePhoto && !canUploadOralPhoto}
                                        onClick={() => {
                                            if (previewPhoto?.previewUrl) {
                                                setOralPhotoPreviewTarget({
                                                    viewType: 'smile',
                                                    photoId: previewPhoto.photo.id,
                                                });
                                                return;
                                            }
                                            if (canUploadOralPhoto) {
                                                pickOralPhoto('smile');
                                            }
                                        }}
                                        className={`group/thumb relative flex min-h-[4.25rem] items-center justify-center overflow-hidden rounded-xl border text-slate-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-1 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-slate-50 sm:min-h-0 ${hasRenderablePhoto ? 'border-slate-200 bg-slate-50 shadow-sm shadow-slate-200/60 hover:border-slate-300 hover:shadow-md' : 'border-dashed border-teal-200 bg-teal-50/30 hover:border-teal-300 hover:bg-teal-50/60'}`}
                                        aria-label={hasRenderablePhoto ? t('patientDetail.oralPhoto.view') : t('patientDetail.oralPhoto.upload')}
                                        title={hasRenderablePhoto ? t('patientDetail.oralPhoto.view') : t('patientDetail.oralPhoto.upload')}
                                    >
                                        {hasRenderablePhoto ? (
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={photoSlot?.thumbnailUrl ?? ''}
                                                    alt={slotLabel}
                                                    crossOrigin={getProtectedMediaCrossOrigin(photoSlot?.thumbnailUrl ?? '')}
                                                    className="h-full w-full object-cover"
                                                    decoding="async"
                                                />
                                                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/0 text-white opacity-0 transition group-hover/thumb:bg-slate-950/25 group-hover/thumb:opacity-100 group-focus-visible/thumb:bg-slate-950/25 group-focus-visible/thumb:opacity-100">
                                                    <Maximize2 className="h-4 w-4" />
                                                </span>
                                            </>
                                        ) : photoSlot?.isProcessing || isUploadingSlot ? (
                                            <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
                                        ) : photoSlot?.isRejected ? (
                                            <AlertCircle className="h-4 w-4 text-rose-500" />
                                        ) : (
                                            <Plus className="h-5 w-5 text-teal-700" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </article>

                {/* Detail: activity and balance snapshot */}
                <article className="group/card relative flex h-[18.5rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/70 md:col-span-2 xl:col-span-1">
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

            <TreatmentHistoryCard patientId={id} patientName={patient.full_name} />

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
                            queryClient.invalidateQueries({ queryKey: ['patients', 'detail', id, 'overview'] });
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

            {oralPhotoPreviewImages.length > 0 ? (
                <PatientPhotoPreviewDialog
                    open={oralPhotoPreviewTarget !== null}
                    onOpenChange={(open) => {
                        if (!open) {
                            setOralPhotoPreviewTarget(null);
                        }
                    }}
                    images={oralPhotoPreviewImages}
                    startIndex={oralPhotoPreviewStartIndex}
                    alt={oralPhotoPreviewLabel}
                    title={oralPhotoPreviewLabel}
                    onDeleteImage={(image) => {
                        if (image.id && oralPhotoPreviewTarget) {
                            setOralPhotoPreviewTarget(null);
                            setDeleteOralPhotoTarget({
                                viewType: oralPhotoPreviewTarget.viewType,
                                photoId: image.id,
                            });
                        }
                    }}
                    onSaveEditedImage={canManagePatients && !isPatientArchived ? async (image, file) => {
                        await saveEditedOralPhoto(image, file);
                    } : undefined}
                    isDeletePending={deleteOralPhotoMutation.isPending}
                    isEditPending={replaceOralPhotoMutation.isPending}
                />
            ) : null}

            <ConfirmActionDialog
                open={deleteOralPhotoTarget !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeleteOralPhotoTarget(null);
                    }
                }}
                title={t('patientDetail.oralPhoto.deleteTitle')}
                description={t('patientDetail.oralPhoto.deleteDescription', {
                    patientName: patient.full_name,
                    slot: deleteOralPhotoSlot ? t(deleteOralPhotoSlot.labelKey) : t('patientDetail.oralPhoto.title'),
                })}
                confirmLabel={t('common.delete')}
                pendingLabel={t('payments.deleting')}
                confirmVariant="destructive"
                isPending={deleteOralPhotoMutation.isPending}
                onConfirm={() => {
                    if (deleteOralPhotoTarget) {
                        deleteOralPhotoMutation.mutate(deleteOralPhotoTarget);
                    }
                }}
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
