'use client';

import { use, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    archivePatient,
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
    Calendar,
    CalendarCheck,
    Clock3,
    Edit,
    HeartPulse,
    MapPin,
    Phone,
    Trash2,
} from 'lucide-react';
import { EditPatientDialog } from '@/components/patients/edit-patient-dialog';
import { toast } from 'sonner';
import { useI18n } from '@/components/providers/i18n-provider';
import { getProtectedMediaCrossOrigin } from '@/lib/protected-media';

const PATIENT_HEADER_NAME_UI_LIMIT = 25;
const PATIENT_CATEGORY_CHIP_UI_LIMIT = 20;
const PATIENT_ALLERGIES_UI_LIMIT = 40;

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

function PatientDetailLoadingSkeleton() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Skeleton className="h-9 w-9" />
                    <div className="space-y-2">
                        <Skeleton className="h-9 w-64" />
                        <Skeleton className="h-4 w-40" />
                    </div>
                </div>
                <Skeleton className="h-9 w-32" />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index}>
                        <CardHeader>
                            <Skeleton className="h-6 w-36" />
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-5/6" />
                            <Skeleton className="h-4 w-2/3" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index}>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-8 w-36" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {Array.from({ length: 3 }).map((__, rowIndex) => (
                            <div
                                key={rowIndex}
                                className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
                            >
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-32" />
                                </div>
                                <Skeleton className="h-6 w-20" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
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

    const patientQuery = useQuery({
        queryKey: ['patients', 'detail', id],
        queryFn: () => getPatient(id),
        retry: false,
        staleTime: 30_000,
    });

    const overviewQuery = useQuery({
        queryKey: ['patients', 'detail', id, 'overview', todayDateKey],
        queryFn: () => getPatientOverview(id),
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
        patientQuery.isLoading ||
        overviewQuery.isLoading
    ) {
        return <PatientDetailLoadingSkeleton />;
    }

    if (
        patientQuery.isError ||
        overviewQuery.isError
    ) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(
                        patientQuery.error ||
                            overviewQuery.error,
                        t('patientDetail.error.loadFailed')
                    )}
                </p>
                <Button
                    variant="outline"
                    onClick={() => {
                        patientQuery.refetch();
                        overviewQuery.refetch();
                    }}
                >
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    if (!patient) {
        return (
            <div className="py-12 text-center">
                <p className="text-gray-500">{t('patientDetail.notFound')}</p>
                <Link href="/patients">
                    <Button variant="outline" className="mt-4">
                        {t('patientDetail.backToPatients')}
                    </Button>
                </Link>
            </div>
        );
    }

    const daysSinceVisit = getDaysSinceLastVisit(latestVisitDate);
    const isInactive = daysSinceVisit > 180;
    const primaryCategory = patient.categories?.[0] ?? null;
    const patientAvatarUrl = patient.photo_thumbnail_ready === false
        ? (patient.photo_preview_ready ? patient.photo_preview_url ?? undefined : undefined)
        : patient.photo_thumbnail_url ?? patient.photo_preview_url ?? undefined;

    return (
        <div className="space-y-5 lg:space-y-6">
            <div className="flex flex-col gap-4 rounded-[1.75rem] border border-white/80 bg-gradient-to-br from-white via-blue-50/55 to-white p-5 shadow-sm shadow-slate-200/70 sm:p-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/patients')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Avatar className="h-14 w-14 border border-white shadow-sm shadow-slate-200">
                        {patientAvatarUrl ? (
                            <AvatarImage
                                src={patientAvatarUrl}
                                alt={patient.full_name}
                                crossOrigin={getProtectedMediaCrossOrigin(patientAvatarUrl)}
                            />
                        ) : null}
                        <AvatarFallback className="bg-slate-100 text-sm font-semibold text-slate-700">
                            {getPatientInitials(patient.full_name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <h1
                            className="max-w-full truncate text-3xl font-bold tracking-[-0.04em] text-slate-950 sm:text-4xl"
                            title={patient.full_name}
                        >
                            {truncateForUi(patient.full_name, PATIENT_HEADER_NAME_UI_LIMIT)}
                        </h1>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <p className="max-w-full text-gray-500 [overflow-wrap:anywhere]">
                                {t('patientDetail.patientId', { patientId: patient.patient_id })}
                            </p>
                            {primaryCategory ? (
                                <Badge
                                    variant="secondary"
                                    className="max-w-full border border-transparent [overflow-wrap:anywhere]"
                                    style={{
                                        backgroundColor: `${primaryCategory.color}22`,
                                        color: primaryCategory.color,
                                    }}
                                    title={primaryCategory.name}
                                >
                                    {truncateForUi(primaryCategory.name, PATIENT_CATEGORY_CHIP_UI_LIMIT)}
                                </Badge>
                            ) : (
                                <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                                    {t('patients.uncategorized')}
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
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
                        onClick={() => setIsEditDialogOpen(true)}
                        disabled={isPatientArchived}
                    >
                        <Edit className="mr-2 h-4 w-4" />
                        {t('patientDetail.editPatient')}
                    </Button>
                    {isPatientArchived ? (
                        <Button
                            variant="outline"
                            onClick={() => setIsRestorePatientDialogOpen(true)}
                            disabled={restorePatientMutation.isPending || permanentlyDeletePatientMutation.isPending}
                        >
                            {t('patients.restore')}
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            className="text-amber-700 hover:text-amber-800"
                            onClick={() => setIsArchivePatientDialogOpen(true)}
                            disabled={archivePatientMutation.isPending}
                        >
                            {t('patientDetail.archive')}
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setIsPermanentDeletePatientDialogOpen(true)}
                        disabled={archivePatientMutation.isPending || restorePatientMutation.isPending || permanentlyDeletePatientMutation.isPending}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('patientDetail.deletePermanently')}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <Card className="interactive-card overflow-hidden bg-gradient-to-br from-white via-white to-blue-50/35">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-lg">{t('patientDetail.contactInfo')}</CardTitle>
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm shadow-blue-100">
                                <Phone className="h-4 w-4" />
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                        <div className="flex items-center rounded-2xl border border-slate-100 bg-white/80 px-3 py-2.5 text-sm shadow-xs">
                            <Phone className="mr-2 h-4 w-4 text-blue-500" />
                            <span className="[overflow-wrap:anywhere]">{patient.phone}</span>
                        </div>
                        {patient.secondary_phone ? (
                            <div className="flex items-center rounded-2xl border border-slate-100 bg-white/80 px-3 py-2.5 text-sm shadow-xs">
                                <Phone className="mr-2 h-4 w-4 text-blue-500" />
                                <span className="[overflow-wrap:anywhere]">{patient.secondary_phone}</span>
                            </div>
                        ) : null}
                        {patient.address ? (
                            <div className="flex items-start rounded-2xl border border-slate-100 bg-white/80 px-3 py-2.5 text-sm shadow-xs">
                                <MapPin className="mr-2 mt-0.5 h-4 w-4 text-blue-500" />
                                <span className="[overflow-wrap:anywhere]">{patient.address}</span>
                            </div>
                        ) : null}
                        {patient.date_of_birth ? (
                            <div className="flex items-center rounded-2xl border border-slate-100 bg-white/80 px-3 py-2.5 text-sm shadow-xs">
                                <Calendar className="mr-2 h-4 w-4 text-blue-500" />
                                <span>{t('patientDetail.born', { date: formatDate(patient.date_of_birth) })}</span>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                <Card className="interactive-card overflow-hidden bg-gradient-to-br from-white via-white to-emerald-50/25">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-lg">{t('patientDetail.medicalInfo')}</CardTitle>
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-sm shadow-emerald-100">
                                <HeartPulse className="h-4 w-4" />
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {patient.allergies ? (
                            <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('patientDetail.allergies')}</p>
                                <Badge
                                    variant="secondary"
                                    className="inline-flex max-w-full items-start justify-start whitespace-normal break-words border border-red-200 bg-red-50 py-1.5 text-red-800"
                                    title={patient.allergies}
                                >
                                    <AlertCircle className="mr-1 h-3 w-3" />
                                    <span className="[overflow-wrap:anywhere]">
                                        {truncateForUi(patient.allergies, PATIENT_ALLERGIES_UI_LIMIT)}
                                    </span>
                                </Badge>
                            </div>
                        ) : null}
                        {patient.current_medications ? (
                            <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('patientDetail.currentMedications')}</p>
                                <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere] break-words">
                                    {patient.current_medications}
                                </p>
                            </div>
                        ) : null}
                        {patient.medical_history ? (
                            <div>
                                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('patientDetail.medicalHistory')}</p>
                                <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere] break-words">
                                    {patient.medical_history}
                                </p>
                            </div>
                        ) : null}
                        {!patient.allergies && !patient.current_medications && !patient.medical_history ? (
                            <p className="text-sm text-gray-400">{t('patientDetail.noMedicalInfo')}</p>
                        ) : null}
                    </CardContent>
                </Card>

                <Card className="interactive-card overflow-hidden bg-gradient-to-br from-white via-white to-slate-50">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-3">
                            <CardTitle className="text-lg">{t('patientDetail.visitSummary')}</CardTitle>
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 shadow-sm shadow-slate-200">
                                <CalendarCheck className="h-4 w-4" />
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                        <div className="rounded-2xl border border-slate-100 bg-white/80 px-3 py-2.5 shadow-xs">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('patientDetail.lastVisit')}</p>
                            <p className="text-sm font-semibold text-slate-950">
                                {latestVisitDate ? formatDate(latestVisitDate) : t('patients.never')}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white/80 px-3 py-2.5 shadow-xs">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('patientDetail.totalAppointments')}</p>
                            <p className="text-sm font-semibold text-slate-950">{patientAppointmentsCount}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-white/80 px-3 py-2.5 shadow-xs">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('patientDetail.openBalance')}</p>
                            <p className="text-sm font-semibold">
                                {totalBalance > 0 ? (
                                    <span className="text-red-600">{formatCurrency(totalBalance)}</span>
                                ) : (
                                    <span className="text-green-600">{t('payments.paid')}</span>
                                )}
                            </p>
                        </div>
                        <div className="pt-2">
                            <Link
                                href={`/patients/${id}/history?from=patients`}
                                className="inline-flex items-center rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                            >
                                {t('patientHistory.title')}
                                <span className="ml-1" aria-hidden="true">→</span>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card className="interactive-card overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-white via-white to-blue-50/30">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm shadow-blue-100">
                            <Clock3 className="h-4 w-4" />
                        </span>
                        <CardTitle>{t('appointments.title')}</CardTitle>
                    </div>
                    <Link href={`/appointments?action=new&patientId=${encodeURIComponent(id)}`}>
                        <Button variant="outline" size="sm">
                            {t('dashboard.scheduleAppointment')}
                        </Button>
                    </Link>
                </CardHeader>
                <CardContent>
                    {upcomingAppointments.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/75 px-4 py-5 text-sm text-slate-500">
                            {t('patientDetail.noUpcomingAppointments')}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {upcomingAppointments.map((appointment) => (
                                <div
                                    key={appointment.id}
                                    className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm">
                                            {(appointment.notes?.split('|')[0]?.trim() || t('appointments.general'))}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {t('patientDetail.appointmentAt', {
                                                date: formatDate(appointment.appointment_date),
                                                time: appointment.start_time,
                                            })}
                                        </p>
                                    </div>
                                    <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                        {t(`status.${appointment.status}`)}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <EditPatientDialog
                key={`${patient.id}-${isEditDialogOpen ? 'open' : 'closed'}`}
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                patient={patient}
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
                isPending={permanentlyDeletePatientMutation.isPending}
                onConfirm={() => permanentlyDeletePatientMutation.mutate()}
            />
        </div>
    );
}
