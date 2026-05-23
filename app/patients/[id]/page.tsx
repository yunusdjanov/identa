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
        <div className="flex items-baseline justify-between gap-3 py-[5px]">
            <span className="shrink-0 text-[10px] font-medium text-slate-400">{label}</span>
            <span className={`min-w-0 text-right text-xs font-medium text-slate-800 [overflow-wrap:anywhere] ${valueClassName ?? ''}`}>
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

            {/* Info cards — compact inline label:value layout */}
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                {/* Contact Info */}
                <div className="interactive-card overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-white to-teal-50/40 shadow-sm">
                    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-teal-500" />
                        <span className="text-xs font-semibold text-slate-700">{t('patientDetail.contactInfo')}</span>
                    </div>
                    <div className="px-3 py-2">
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
                    </div>
                </div>

                {/* Medical Info */}
                <div className="interactive-card overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-white to-emerald-50/30 shadow-sm">
                    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                        <HeartPulse className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span className="text-xs font-semibold text-slate-700">{t('patientDetail.medicalInfo')}</span>
                    </div>
                    <div className="px-3 py-2">
                        {patient.allergies ? (
                            <div className="py-[5px]">
                                <div className="flex items-start gap-1.5">
                                    <AlertCircle className="mt-px h-3 w-3 shrink-0 text-red-400" />
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-medium text-slate-400">{t('patientDetail.allergies')}</p>
                                        <p className="text-xs font-medium text-red-700 [overflow-wrap:anywhere]" title={patient.allergies}>
                                            {truncateForUi(patient.allergies, PATIENT_ALLERGIES_UI_LIMIT)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {patient.current_medications ? (
                            <div className="py-[5px]">
                                <p className="text-[10px] font-medium text-slate-400">{t('patientDetail.currentMedications')}</p>
                                <p className="text-xs text-slate-700 [overflow-wrap:anywhere]" title={patient.current_medications}>
                                    {truncateForUi(patient.current_medications, PATIENT_MEDICATIONS_UI_LIMIT)}
                                </p>
                            </div>
                        ) : null}
                        {patient.medical_history ? (
                            <div className="py-[5px]">
                                <p className="text-[10px] font-medium text-slate-400">{t('patientDetail.medicalHistory')}</p>
                                <p className="text-xs text-slate-700 [overflow-wrap:anywhere]" title={patient.medical_history}>
                                    {truncateForUi(patient.medical_history, PATIENT_MEDICAL_HISTORY_UI_LIMIT)}
                                </p>
                            </div>
                        ) : null}
                        {!patient.allergies && !patient.current_medications && !patient.medical_history ? (
                            <p className="py-[5px] text-xs text-slate-400">{t('patientDetail.noMedicalInfo')}</p>
                        ) : null}
                    </div>
                </div>

                {/* Visit Summary */}
                <div className="interactive-card overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80 shadow-sm">
                    <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                        <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                        <span className="text-xs font-semibold text-slate-700">{t('patientDetail.visitSummary')}</span>
                    </div>
                    <div className="px-3 py-2">
                        <InfoRow
                            label={t('patientDetail.lastVisit')}
                            value={latestVisitDate ? formatDate(latestVisitDate) : t('patients.never')}
                        />
                        <InfoRow
                            label={t('patientDetail.totalAppointments')}
                            value={canViewAppointments ? patientAppointmentsCount : '—'}
                        />
                        <InfoRow
                            label={t('patientDetail.openBalance')}
                            value={
                                !canViewPayments ? '—'
                                : totalBalance > 0 ? formatCurrency(totalBalance)
                                : t('payments.paid')
                            }
                            valueClassName={
                                !canViewPayments ? 'text-slate-400'
                                : totalBalance > 0 ? 'text-amber-600 font-semibold'
                                : 'text-emerald-600'
                            }
                        />
                    </div>
                    <div className="border-t border-slate-100 px-3 py-2">
                        <Link
                            href={`/patients/${id}/history?from=patients`}
                            className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline"
                        >
                            {t('patientHistory.title')} →
                        </Link>
                    </div>
                </div>
            </div>

            {/* Appointments */}
            <Card className="interactive-card overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-white via-white to-teal-100/30">
                <CardHeader className="flex flex-col gap-2 px-4 pb-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-50 text-teal-600">
                            <Clock3 className="h-3.5 w-3.5" />
                        </span>
                        <CardTitle className="text-sm font-semibold">{t('appointments.title')}</CardTitle>
                    </div>
                    {canViewAppointments ? (
                        <Link href={`/appointments?action=new&patientId=${encodeURIComponent(id)}`}>
                            <Button
                                size="sm"
                                className="h-7 rounded-full bg-teal-600 px-3 text-xs font-medium text-white hover:bg-teal-700"
                                disabled={!canManageAppointments}
                            >
                                {t('dashboard.scheduleAppointment')}
                            </Button>
                        </Link>
                    ) : null}
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-1">
                    {!canViewAppointments ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white/75 px-4 py-4 text-xs text-slate-500">
                            {PERMISSION_DENIED_MESSAGE}
                        </div>
                    ) : upcomingAppointments.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white/75 px-4 py-4 text-xs text-slate-500">
                            {t('patientDetail.noUpcomingAppointments')}
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {upcomingAppointments.map((appointment) => (
                                <div
                                    key={appointment.id}
                                    className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between first:pt-0 last:pb-0"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-slate-800">
                                            {(appointment.notes?.split('|')[0]?.trim() || t('appointments.general'))}
                                        </p>
                                        <p className="text-[11px] text-gray-400">
                                            {t('patientDetail.appointmentAt', {
                                                date: formatDate(appointment.appointment_date),
                                                time: appointment.start_time,
                                            })}
                                        </p>
                                    </div>
                                    <Badge variant="secondary" className="w-fit bg-teal-100 text-xs text-teal-800">
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
