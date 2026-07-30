'use client';

import dynamic from 'next/dynamic';
import { use, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { PatientDetailLoadingState } from '@/components/layout/page-loading-skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import {
    deletePatientOralPhoto,
    getCurrentUser,
    getPatient,
    getPatientOverview,
    replacePatientOralPhoto,
    uploadPatientOralPhoto,
} from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import {
    formatCurrency,
    formatDate,
    getDaysSinceLastVisit,
    toLocalDateKey,
} from '@/lib/utils';
import {
    Activity,
    AlertCircle,
    CalendarCheck,
    Camera,
    Clock3,
    Hash,
    Loader2,
    Maximize2,
    Plus,
    Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/components/providers/i18n-provider';
import { getProtectedMediaCrossOrigin, getProtectedMediaPreviewUrl, getProtectedMediaThumbnailUrl } from '@/lib/protected-media';
import { optimizeImageFileForUpload } from '@/lib/browser-image';
import type { ApiMoneyCurrency, ApiPatient, ApiPatientClinicalPhotoViewType } from '@/lib/api/types';
import type { PreviewGalleryImage } from '@/components/patients/patient-photo-preview-dialog';
import { PatientDetailHeader } from '@/components/patients/patient-detail-header';
import {
    getPatientOralPhotoGallery,
    hasPendingOralPhotoProcessing,
    hasPendingPatientMediaProcessing,
    ORAL_PHOTO_MAX_PER_SLOT,
    ORAL_PHOTO_POLL_INTERVAL_MS,
    ORAL_PHOTO_SLOTS,
} from '@/lib/patients/oral-photos';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { canManage, canView } from '@/lib/auth/permissions';
import { resolveMediaProcessingPoll } from '@/lib/patients/media-polling';
import { queryKeys } from '@/lib/query-keys';

const PatientPhotoPreviewDialog = dynamic(
    () => import('@/components/patients/patient-photo-preview-dialog').then((module) => module.PatientPhotoPreviewDialog),
    { ssr: false }
);

const TreatmentHistoryCard = dynamic(
    () => import('@/components/patients/treatment-history-card').then((module) => module.TreatmentHistoryCard),
    {
        ssr: false,
        loading: () => <Skeleton className="h-[28rem] w-full rounded-2xl" />,
    }
);

const DEFAULT_ORAL_PHOTO_UPLOAD_MAX_MB = 1;
const ORAL_PHOTO_UPLOAD_MAX_EDGE = 1600;
const PROFILE_MONEY_CURRENCIES: ApiMoneyCurrency[] = ['UZS', 'USD'];

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

export default function PatientDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const { t, locale } = useI18n();
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
    const [oralPhotoPreviewTarget, setOralPhotoPreviewTarget] = useState<{
        viewType: ApiPatientClinicalPhotoViewType;
        photoId: string;
    } | null>(null);
    const [deleteOralPhotoTarget, setDeleteOralPhotoTarget] = useState<{
        viewType: ApiPatientClinicalPhotoViewType;
        photoId: string;
    } | null>(null);
    const [oralPhotoInputKey, setOralPhotoInputKey] = useState(0);
    const mediaPollingStartedAtRef = useRef<number | null>(null);
    const todayDateKey = toLocalDateKey();
    const patientDetailQueryKey = queryKeys.patients.detail(id, {
        rememberRecent: shouldRememberRecent,
    });
    const currentUserQuery = useQuery({
        queryKey: queryKeys.auth.me(),
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });
    const currentUser = currentUserQuery.data;
    const canViewPatients = canView(currentUser, 'patients');
    const canManagePatients = canManage(currentUser, 'patients');
    const canViewPayments = canView(currentUser, 'payments');

    const patientQuery = useQuery({
        queryKey: patientDetailQueryKey,
        queryFn: () => getPatient(id, { rememberRecent: shouldRememberRecent }),
        enabled: canViewPatients,
        retry: false,
        staleTime: 30_000,
        refetchInterval: (query) => {
            const poll = resolveMediaProcessingPoll(
                hasPendingPatientMediaProcessing(query.state.data as ApiPatient | undefined),
                mediaPollingStartedAtRef.current,
                Date.now(),
                ORAL_PHOTO_POLL_INTERVAL_MS
            );
            mediaPollingStartedAtRef.current = poll.startedAt;

            return poll.interval;
        },
        refetchIntervalInBackground: false,
    });

    const overviewQuery = useQuery({
        queryKey: queryKeys.patients.overview(id, todayDateKey),
        queryFn: () => getPatientOverview(id),
        enabled: canViewPatients,
        staleTime: 30_000,
        gcTime: 300_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
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
            queryClient.setQueryData(patientDetailQueryKey, updatedPatient);
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.detail(id) });
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
            queryClient.setQueryData(patientDetailQueryKey, updatedPatient);
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.detail(id) });
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
            queryClient.setQueryData(patientDetailQueryKey, updatedPatient);
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.all() });
            queryClient.invalidateQueries({ queryKey: queryKeys.patients.detail(id) });
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
            editSrc: photo.photo.url ?? photo.previewUrl ?? '',
            downloadSrc: photo.photo.url ?? photo.previewUrl ?? '',
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
    const saveEditedOralPhotoCopy = async (_image: PreviewGalleryImage, editedPhoto: File) => {
        const viewType = oralPhotoPreviewTarget?.viewType;
        if (!viewType || isPatientArchived || !canManagePatients) {
            return;
        }

        const slot = oralPhotoSlots.find((candidate) => candidate.viewType === viewType);
        if ((slot?.photos.length ?? 0) >= ORAL_PHOTO_MAX_PER_SLOT) {
            throw new Error(t('patientDetail.oralPhoto.limitReached', { max: ORAL_PHOTO_MAX_PER_SLOT }));
        }

        const optimizedPhoto = await optimizeImageFileForUpload(editedPhoto, {
            maxEdge: ORAL_PHOTO_UPLOAD_MAX_EDGE,
            targetMaxBytes: oralPhotoUploadMaxBytes,
        });

        if (optimizedPhoto.size > oralPhotoUploadMaxBytes) {
            throw new Error(t('patients.toast.photoTooLarge', { sizeMb: oralPhotoUploadMaxMb }));
        }

        await uploadOralPhotoMutation.mutateAsync({
            photo: optimizedPhoto,
            viewType,
        });
    };

    return (
        <div data-testid="patient-detail-page-layout" className="space-y-2.5">
            <PatientDetailHeader
                patient={patient}
                currentUser={currentUser}
            />
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
                className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_15rem] xl:grid-cols-[minmax(0,1fr)_16rem]"
            >
                {/* Oral photo: compact clinical photo shortcuts */}
                <article className="group/card relative flex h-[20.75rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/70">
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
                <article className="group/card relative flex h-[20.75rem] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/70">
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
                    onSaveEditedCopy={canManagePatients && !isPatientArchived ? saveEditedOralPhotoCopy : undefined}
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

        </div>
    );
}
