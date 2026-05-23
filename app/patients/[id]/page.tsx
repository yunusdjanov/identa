'use client';

import dynamic from 'next/dynamic';
import { use, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { PatientDetailLoadingState } from '@/components/layout/page-loading-skeletons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    archivePatient,
    getCurrentUser,
    getPatient,
    getPatientOverview,
    permanentlyDeletePatient,
    restorePatient,
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
    AlertCircle,
    ArrowLeft,
    CalendarCheck,
    Clock3,
    Edit,
    HeartPulse,
    Phone,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/components/providers/i18n-provider';
import { getProtectedMediaCrossOrigin, getProtectedMediaThumbnailUrl } from '@/lib/protected-media';
import { INPUT_LIMITS } from '@/lib/input-validation';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { canManage, canView, PERMISSION_DENIED_MESSAGE } from '@/lib/auth/permissions';

const EditPatientDialog = dynamic(
    () => import('@/components/patients/edit-patient-dialog').then((module) => module.EditPatientDialog),
    { ssr: false }
);

const PATIENT_HEADER_NAME_UI_LIMIT = 25;
const PATIENT_CATEGORY_CHIP_UI_LIMIT = 20;
const PATIENT_ALLERGIES_UI_LIMIT = INPUT_LIMITS.medicalAllergies;
const PATIENT_MEDICATIONS_UI_LIMIT = INPUT_LIMITS.medicalMedications;
const PATIENT_MEDICAL_HISTORY_UI_LIMIT = INPUT_LIMITS.medicalHistory;

function InfoRow({
    label,
    value,
    valueClassName,
}: {
    label: string;
    value: ReactNode;
    valueClassName?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-4 border-b border-slate-100/70 py-2 first:pt-0 last:border-0 last:pb-0">
            <span className="shrink-0 text-[11px] text-slate-400">{label}</span>
            <span className={`min-w-0 text-right text-sm font-medium text-slate-900 [overflow-wrap:anywhere] ${valueClassName ?? ''}`}>
                {value}
            </span>
        </div>
    );
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

export default function PatientDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const { t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isArchivePatientDialogOpen, setIsArchivePatientDialogOpen] = useState(false);
    const [isRestorePatientDialogOpen, setIsRestorePatientDialogOpen] = useState(false);
    const [isPermanentDeletePatientDialogOpen, setIsPermanentDeletePatientDialogOpen] = useState(false);
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

    const patient = patientQuery.data;
    const patientAppointmentsCount = overviewQuery.data?.appointment_count ?? 0;
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
                description={PERMISSION_DENIED_MESSAGE}
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
    }) ?? undefined;

    return (
        <div className="space-y-4">
            {/* Patient header */}
            <div className="flex flex-col gap-3 rounded-[1.5rem] border border-white/80 bg-gradient-to-br from-white via-teal-100/55 to-white px-4 py-3 shadow-sm shadow-slate-200/70 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
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
                            <p className="text-xs text-gray-500 [overflow-wrap:anywhere]">
                                {t('patientDetail.patientId', { patientId: patient.patient_id })}
                            </p>
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
                                <Badge variant="secondary" className="bg-gray-100 text-xs text-gray-600">
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
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full px-3 text-xs"
                        onClick={() => setIsEditDialogOpen(true)}
                        disabled={isPatientArchived || !canManagePatients}
                    >
                        <Edit className="mr-1.5 h-3 w-3" />
                        {t('patientDetail.editPatient')}
                    </Button>
                    {isPatientArchived ? (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-full px-3 text-xs"
                            onClick={() => setIsRestorePatientDialogOpen(true)}
                            disabled={
                                restorePatientMutation.isPending
                                || permanentlyDeletePatientMutation.isPending
                                || !canManagePatients
                            }
                        >
                            {t('patients.restore')}
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-full px-3 text-xs text-amber-700 hover:text-amber-800"
                            onClick={() => setIsArchivePatientDialogOpen(true)}
                            disabled={archivePatientMutation.isPending || !canManagePatients}
                        >
                            {t('patientDetail.archive')}
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 rounded-full px-3 text-xs text-red-600 hover:text-red-700"
                        onClick={() => setIsPermanentDeletePatientDialogOpen(true)}
                        disabled={
                            archivePatientMutation.isPending
                            || restorePatientMutation.isPending
                            || permanentlyDeletePatientMutation.isPending
                            || !canManagePatients
                        }
                    >
                        <Trash2 className="mr-1.5 h-3 w-3" />
                        {t('patientDetail.deletePermanently')}
                    </Button>
                </div>
            </div>

            {/* Info cards */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {/* Contact Info */}
                <Card className="interactive-card overflow-hidden rounded-2xl bg-gradient-to-br from-white via-white to-teal-50/50">
                    <CardHeader className="flex flex-row items-center gap-2.5 px-4 pb-2 pt-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 shadow-sm shadow-teal-100/60">
                            <Phone className="h-3.5 w-3.5" />
                        </span>
                        <CardTitle className="text-sm font-semibold text-slate-800">{t('patientDetail.contactInfo')}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-0">
                        <InfoRow label={t('patientDetail.phone1')} value={patient.phone} />
                        {patient.secondary_phone ? (
                            <InfoRow label={t('patientDetail.phone2')} value={patient.secondary_phone} />
                        ) : null}
                        {patient.address ? (
                            <InfoRow label={t('patientDetail.address')} value={patient.address} />
                        ) : null}
                        {patient.date_of_birth ? (
                            <InfoRow label={t('patientDetail.birthDate')} value={formatDate(patient.date_of_birth)} />
                        ) : null}
                    </CardContent>
                </Card>

                {/* Medical Info */}
                <Card className="interactive-card overflow-hidden rounded-2xl bg-gradient-to-br from-white via-white to-emerald-50/40">
                    <CardHeader className="flex flex-row items-center gap-2.5 px-4 pb-2 pt-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shadow-sm shadow-emerald-100/60">
                            <HeartPulse className="h-3.5 w-3.5" />
                        </span>
                        <CardTitle className="text-sm font-semibold text-slate-800">{t('patientDetail.medicalInfo')}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-0">
                        {!patient.allergies && !patient.current_medications && !patient.medical_history ? (
                            <p className="text-xs text-slate-400">{t('patientDetail.noMedicalInfo')}</p>
                        ) : null}
                        {patient.allergies ? (
                            <div className="border-b border-slate-100 py-2 last:border-0 last:pb-0">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{t('patientDetail.allergies')}</p>
                                <p className="mt-0.5 flex items-start gap-1 text-xs font-medium text-red-600">
                                    <AlertCircle className="mt-px h-3 w-3 shrink-0" />
                                    <span className="[overflow-wrap:anywhere]">{truncateForUi(patient.allergies, PATIENT_ALLERGIES_UI_LIMIT)}</span>
                                </p>
                            </div>
                        ) : null}
                        {patient.current_medications ? (
                            <div className="border-b border-slate-100 py-2 last:border-0 last:pb-0">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{t('patientDetail.currentMedications')}</p>
                                <p className="mt-0.5 text-xs text-slate-700 [overflow-wrap:anywhere]">{truncateForUi(patient.current_medications, PATIENT_MEDICATIONS_UI_LIMIT)}</p>
                            </div>
                        ) : null}
                        {patient.medical_history ? (
                            <div className="border-b border-slate-100 py-2 last:border-0 last:pb-0">
                                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{t('patientDetail.medicalHistory')}</p>
                                <p className="mt-0.5 text-xs text-slate-700 [overflow-wrap:anywhere]">{truncateForUi(patient.medical_history, PATIENT_MEDICAL_HISTORY_UI_LIMIT)}</p>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                {/* Visit Summary */}
                <Card className="interactive-card overflow-hidden rounded-2xl bg-gradient-to-br from-white via-white to-slate-50">
                    <CardHeader className="flex flex-row items-center gap-2.5 px-4 pb-2 pt-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 shadow-sm shadow-slate-200/60">
                            <CalendarCheck className="h-3.5 w-3.5" />
                        </span>
                        <CardTitle className="text-sm font-semibold text-slate-800">{t('patientDetail.visitSummary')}</CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-3 pt-0">
                        <InfoRow label={t('patientDetail.lastVisit')} value={latestVisitDate ? formatDate(latestVisitDate) : t('patients.never')} />
                        <InfoRow label={t('patientDetail.totalAppointments')} value={canViewAppointments ? patientAppointmentsCount : '—'} />
                        <InfoRow
                            label={t('patientDetail.openBalance')}
                            value={!canViewPayments ? '—' : totalBalance > 0 ? formatCurrency(totalBalance) : t('payments.paid')}
                            valueClassName={
                                !canViewPayments ? 'text-slate-400'
                                : totalBalance > 0 ? 'text-amber-600 font-semibold'
                                : 'text-emerald-600'
                            }
                        />
                        <div className="mt-3 border-t border-slate-100 pt-2.5">
                            <Link
                                href={`/patients/${id}/history?from=patients`}
                                className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 transition-colors hover:text-teal-700"
                            >
                                {t('patientHistory.title')}
                                <span aria-hidden="true">→</span>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Appointments */}
            <Card className="interactive-card overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-white via-white to-teal-50/30">
                <CardHeader className="flex flex-col gap-2 border-b border-slate-100 px-4 pb-3 pt-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-50 text-teal-600 shadow-sm shadow-teal-100/60">
                            <Clock3 className="h-3.5 w-3.5" />
                        </span>
                        <CardTitle className="text-sm font-semibold text-slate-800">{t('appointments.title')}</CardTitle>
                    </div>
                    {canViewAppointments ? (
                        <Link href={`/appointments?action=new&patientId=${encodeURIComponent(id)}`}>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-full px-3 text-xs"
                                disabled={!canManageAppointments}
                            >
                                {t('dashboard.scheduleAppointment')}
                            </Button>
                        </Link>
                    ) : null}
                </CardHeader>
                <CardContent className="p-0">
                    {!canViewAppointments ? (
                        <p className="px-4 py-4 text-xs text-slate-500">{PERMISSION_DENIED_MESSAGE}</p>
                    ) : upcomingAppointments.length === 0 ? (
                        <p className="px-4 py-4 text-xs text-slate-500">{t('patientDetail.noUpcomingAppointments')}</p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {upcomingAppointments.map((appointment) => (
                                <div
                                    key={appointment.id}
                                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/60"
                                >
                                    <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                                        <span className="text-[10px] font-bold leading-none">
                                            {appointment.start_time?.slice(0, 5)}
                                        </span>
                                        <span className="mt-0.5 text-[9px] leading-none text-teal-500">
                                            {formatDate(appointment.appointment_date).slice(0, 6)}
                                        </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-slate-800">
                                            {appointment.notes?.split('|')[0]?.trim() || t('appointments.general')}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {formatDate(appointment.appointment_date)}
                                        </p>
                                    </div>
                                    <Badge
                                        variant="secondary"
                                        className="shrink-0 rounded-full bg-teal-100/80 px-2.5 text-xs font-medium text-teal-700"
                                    >
                                        {t(`status.${appointment.status}`)}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {isEditDialogOpen && canManagePatients ? (
                <EditPatientDialog
                    key={`${patient.id}-open`}
                    open={isEditDialogOpen}
                    onOpenChange={setIsEditDialogOpen}
                    patient={patient}
                    uploadMaxMb={currentUser?.subscription?.upload_max_mb}
                    storedImageMaxMb={currentUser?.subscription?.stored_image_max_mb}
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
                isPending={permanentlyDeletePatientMutation.isPending}
                onConfirm={() => permanentlyDeletePatientMutation.mutate()}
            />
        </div>
    );
}
