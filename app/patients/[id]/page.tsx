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
    Archive,
    ArrowLeft,
    Calendar,
    CalendarCheck,
    CalendarPlus,
    Camera,
    Clock3,
    Edit,
    FileText,
    Hash,
    Loader2,
    MapPin,
    Maximize2,
    Phone,
    Pill,
    Plus,
    Trash2,
    Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/components/providers/i18n-provider';
import { getProtectedMediaCrossOrigin, getProtectedMediaPreviewUrl, getProtectedMediaThumbnailUrl } from '@/lib/protected-media';
import { INPUT_LIMITS } from '@/lib/input-validation';
import { optimizeImageFileForUpload } from '@/lib/browser-image';
import type { ApiMoneyCurrency, ApiPatient, ApiPatientClinicalPhotoViewType } from '@/lib/api/types';
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
const PATIENT_HEADER_NAME_SECOND_LINE_UI_LIMIT = 20;
const PATIENT_CATEGORY_CHIP_UI_LIMIT = 20;
const PATIENT_ALLERGIES_UI_LIMIT = INPUT_LIMITS.medicalAllergies;
const PATIENT_MEDICATIONS_UI_LIMIT = INPUT_LIMITS.medicalMedications;
const PATIENT_MEDICAL_HISTORY_UI_LIMIT = INPUT_LIMITS.medicalHistory;
const DEFAULT_ORAL_PHOTO_UPLOAD_MAX_MB = 1;
const ORAL_PHOTO_UPLOAD_MAX_EDGE = 1600;
const PROFILE_MONEY_CURRENCIES: ApiMoneyCurrency[] = ['UZS', 'USD'];
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

function getOverviewBalanceLines(overview: {
    total_balance?: number;
    totals_by_currency?: Partial<Record<ApiMoneyCurrency, { total_balance: number }>>;
} | undefined) {
    const lines = PROFILE_MONEY_CURRENCIES
        .map((currency) => ({
            currency,
            rawAmount: Number(overview?.totals_by_currency?.[currency]?.total_balance ?? 0),
        }))
        .filter(({ rawAmount }) => rawAmount !== 0)
        .map(({ currency, rawAmount }) => ({ currency, rawAmount, amount: Math.abs(rawAmount) }));

    if (lines.length > 0 || !overview?.total_balance) {
        return lines;
    }

    return [{ currency: 'UZS' as const, rawAmount: overview.total_balance, amount: Math.abs(overview.total_balance) }];
}

function getOverviewBalanceClassName(overview: Parameters<typeof getOverviewBalanceLines>[0], canViewPayments: boolean) {
    if (!canViewPayments) {
        return 'text-slate-700';
    }

    const lines = getOverviewBalanceLines(overview);
    const hasDebt = lines.some(({ rawAmount }) => rawAmount > 0);
    const hasAdvance = lines.some(({ rawAmount }) => rawAmount < 0);

    if (hasDebt && hasAdvance) {
        return 'text-slate-700';
    }

    if (hasDebt) {
        return 'text-red-700';
    }

    if (hasAdvance) {
        return 'text-blue-700';
    }

    return 'text-emerald-700';
}

function getOverviewBalanceStatusKey(balance: number) {
    if (balance < 0) {
        return 'patientHistory.balanceStatus.advance';
    }

    if (balance > 0) {
        return 'patientHistory.balanceStatus.debt';
    }

    return 'patientHistory.balanceStatus.paid';
}

function getOverviewBalanceStatusClassName(balance: number) {
    if (balance < 0) {
        return 'border-blue-200 bg-blue-50 text-blue-700';
    }

    if (balance > 0) {
        return 'border-yellow-200 bg-yellow-50 text-yellow-700';
    }

    return 'border-slate-200 bg-slate-50 text-slate-600';
}

function renderOverviewBalance(
    overview: Parameters<typeof getOverviewBalanceLines>[0],
    paidLabel: string,
    t: ReturnType<typeof useI18n>['t']
) {
    const lines = getOverviewBalanceLines(overview);

    if (lines.length === 0) {
        return paidLabel;
    }

    return (
        <span className="flex flex-col items-center gap-0.5 leading-tight">
            {lines.map(({ currency, rawAmount, amount }) => (
                <span key={currency} className="flex max-w-full flex-wrap items-center justify-center gap-1">
                    <span className="whitespace-nowrap tabular-nums">{formatCurrency(amount, currency)}</span>
                    <span className={`inline-flex items-center rounded-full border px-1 py-0.5 text-[9px] font-semibold leading-none ${getOverviewBalanceStatusClassName(rawAmount)}`}>
                        {t(getOverviewBalanceStatusKey(rawAmount))}
                    </span>
                </span>
            ))}
        </span>
    );
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
    value: React.ReactNode;
    valueClassName?: string;
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-1 bg-white px-3 py-4 text-center">
            <div className="inline-flex items-center gap-1 text-slate-400">
                <Icon className="h-3 w-3" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em]">{label}</p>
            </div>
            <p
                className={`max-w-full text-[13px] font-semibold tabular-nums text-slate-900 ${typeof value === 'string' ? 'truncate' : ''} ${valueClassName ?? ''}`}
                title={typeof value === 'string' ? value : undefined}
            >
                {value}
            </p>
        </div>
    );
}

type PatientHeaderFactTone = 'teal' | 'rose' | 'amber' | 'slate' | 'sky';

const PATIENT_HEADER_FACT_TONE_CLASSES: Record<PatientHeaderFactTone, { icon: string; value: string; box: string }> = {
    teal: {
        icon: 'bg-teal-50 text-teal-600 ring-teal-100',
        value: 'text-slate-900',
        box: 'bg-white/70',
    },
    rose: {
        icon: 'bg-rose-50 text-rose-600 ring-rose-100',
        value: 'text-rose-900',
        box: 'bg-rose-50/45',
    },
    amber: {
        icon: 'bg-amber-50 text-amber-600 ring-amber-100',
        value: 'text-amber-950',
        box: 'bg-amber-50/45',
    },
    slate: {
        icon: 'bg-slate-100 text-slate-500 ring-slate-200/80',
        value: 'text-slate-800',
        box: 'bg-white/65',
    },
    sky: {
        icon: 'bg-sky-50 text-sky-600 ring-sky-100',
        value: 'text-slate-900',
        box: 'bg-white/70',
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
        <div className={`flex min-w-0 items-center gap-2 overflow-hidden rounded-xl px-2 py-1.5 ${toneClasses.box} ${className}`}>
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
    const hasValue = Boolean(value);
    const safeValue = value ?? '';
    const displayValue = hasValue ? truncateForUi(safeValue, truncateLimit) : emptyLabel;

    return (
        <PatientHeaderFact
            icon={Icon}
            label={label}
            value={displayValue}
            title={hasValue ? safeValue : label}
            tone={tone}
            className="min-h-10"
            valueClassName={hasValue ? '' : 'text-slate-400'}
        />
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
    const compactEmptyValue = '—';
    const headerPhones = [patient.phone, patient.secondary_phone].filter((phone): phone is string => Boolean(phone));
    const headerPhoneTitle = headerPhones.length > 0 ? headerPhones.join(' / ') : t('patientDetail.notSpecified');
    const headerBirthDateValue = patient.date_of_birth ? formatDate(patient.date_of_birth) : compactEmptyValue;
    const headerAddressValue = patient.address?.trim() ? patient.address : compactEmptyValue;
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
    const patientHeaderNameLines = getPatientHeaderNameLines(patient.full_name);

    return (
        <div data-testid="patient-detail-page-layout" className="space-y-2.5">
            {/* Patient header */}
            <div className="grid grid-cols-1 gap-2.5 rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm shadow-slate-200/70 sm:px-5 lg:grid-cols-[minmax(22rem,24rem)_minmax(0,1fr)] lg:items-center xl:grid-cols-[minmax(22rem,24rem)_minmax(0,1fr)_auto]">
                <div
                    data-testid="patient-detail-header-identity"
                    className="flex w-full min-w-0 max-w-[24rem] items-center gap-3"
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
                        <div className="relative h-16 w-20 shrink-0 overflow-visible">
                            <button
                                type="button"
                                className="group absolute left-0 top-1/2 h-20 w-20 -translate-y-1/2 overflow-hidden rounded-full border border-white bg-white p-0 shadow-sm shadow-slate-200 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
                                aria-label={`${t('patients.form.photo')}: ${patient.full_name}`}
                                onClick={() => setIsPatientPhotoPreviewOpen(true)}
                            >
                                <Avatar className="h-full w-full">
                                    <AvatarImage
                                        src={patientAvatarUrl}
                                        alt={patient.full_name}
                                        crossOrigin={getProtectedMediaCrossOrigin(patientAvatarUrl)}
                                    />
                                    <AvatarFallback className="bg-slate-100 text-base font-semibold text-slate-700">
                                        {getPatientInitials(patient.full_name)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100 group-focus-visible:bg-slate-950/35 group-focus-visible:opacity-100">
                                    <Maximize2 className="h-4 w-4" />
                                </span>
                            </button>
                        </div>
                    ) : (
                        <div className="relative h-16 w-20 shrink-0 overflow-visible">
                            <Avatar className="absolute left-0 top-1/2 h-20 w-20 -translate-y-1/2 border border-white bg-slate-100 shadow-sm shadow-slate-200">
                                <AvatarFallback className="bg-slate-100 text-base font-semibold text-slate-700">
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
                        <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
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
                    className="grid h-[8rem] min-w-0 grid-rows-[1fr_auto_1fr] gap-1.5 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/70 px-2.5 py-2 shadow-inner shadow-white/60 lg:col-span-2 lg:row-start-2 xl:col-span-1 xl:col-start-2 xl:row-start-1"
                >
                    <div
                        data-testid="patient-detail-header-contact-facts"
                        className="grid min-h-0 min-w-0 gap-1.5 md:grid-cols-3"
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
                        className="grid min-h-0 min-w-0 gap-1.5 md:grid-cols-3"
                    >
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

            {/* Premium summary cards: oral photo, detail. */}
            <div
                data-testid="patient-detail-summary-grid"
                className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_18rem]"
            >
                {/* Oral photo: compact clinical photo shortcuts */}
                <article className="group/card relative flex h-[19.5rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/70">
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
                    <div className="flex min-h-0 flex-1 px-4 py-3">
                        <div
                            data-testid="patient-detail-oral-photo-grid"
                            className="grid h-full min-h-0 flex-1 grid-cols-2 grid-rows-[repeat(5,minmax(0,1fr))] gap-2.5 sm:grid-cols-5 sm:grid-rows-[repeat(2,minmax(0,1fr))]"
                        >
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
                                        data-testid="patient-detail-oral-photo-slot"
                                        className={`group/thumb relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden rounded-xl border text-slate-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-1 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-slate-50 ${hasRenderablePhoto ? 'border-slate-200 bg-slate-50 shadow-sm shadow-slate-200/60 hover:border-slate-300 hover:shadow-md' : 'border-dashed border-teal-200 bg-teal-50/30 hover:border-teal-300 hover:bg-teal-50/60'}`}
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
                <article className="group/card relative flex h-[19.5rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/70">
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
                    <div className="mx-px flex flex-1 flex-col divide-y divide-slate-100 overflow-hidden rounded-b-2xl bg-white">
                        <VitalStatCell
                            icon={Wallet}
                            label={t('patientDetail.openBalance')}
                            value={!canViewPayments ? '—' : renderOverviewBalance(overviewQuery.data, t('payments.paid'), t)}
                            valueClassName={getOverviewBalanceClassName(overviewQuery.data, canViewPayments)}
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
