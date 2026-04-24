'use client';

import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentUser, getDashboardSnapshot } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { formatCurrency, toLocalDateKey, truncateForUi } from '@/lib/utils';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { AlertCircle, ArrowRight, Calendar, CheckCircle2, Clock3, DollarSign, Plus } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/components/providers/i18n-provider';

const noopSubscribe = () => () => undefined;
const DASHBOARD_NAME_UI_LIMIT = 25;
const DASHBOARD_REASON_UI_LIMIT = 40;

type DashboardStatTone = 'blue' | 'green' | 'red' | 'amber';

const statToneClasses: Record<DashboardStatTone, {
    card: string;
    icon: string;
    value: string;
    glow: string;
}> = {
    blue: {
        card: 'border-blue-100 bg-gradient-to-br from-white via-blue-50/35 to-white',
        icon: 'bg-blue-600 text-white shadow-blue-200',
        value: 'text-blue-950',
        glow: 'bg-blue-500/10',
    },
    green: {
        card: 'border-emerald-100 bg-gradient-to-br from-white via-emerald-50/35 to-white',
        icon: 'bg-emerald-600 text-white shadow-emerald-200',
        value: 'text-emerald-950',
        glow: 'bg-emerald-500/10',
    },
    red: {
        card: 'border-red-100 bg-gradient-to-br from-white via-red-50/35 to-white',
        icon: 'bg-red-600 text-white shadow-red-200',
        value: 'text-red-950',
        glow: 'bg-red-500/10',
    },
    amber: {
        card: 'border-amber-100 bg-gradient-to-br from-white via-amber-50/35 to-white',
        icon: 'bg-amber-500 text-white shadow-amber-200',
        value: 'text-amber-950',
        glow: 'bg-amber-500/10',
    },
};

function getStatusTone(status: string): { dot: string; text: string } {
    switch (status) {
        case 'completed':
            return { dot: 'bg-green-600', text: 'text-green-700' };
        case 'cancelled':
            return { dot: 'bg-red-600', text: 'text-red-700' };
        case 'no_show':
            return { dot: 'bg-amber-600', text: 'text-amber-700' };
        case 'scheduled':
        default:
            return { dot: 'bg-blue-600', text: 'text-blue-700' };
    }
}

function toMinutesFromTime(timeInput: string): number {
    const [hours, minutes] = timeInput.split(':').map(Number);
    return hours * 60 + minutes;
}

function formatAppointmentHourMinute(timeInput: string): string {
    return timeInput.slice(0, 5);
}

function DashboardLoadingSkeleton() {
    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-48" />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-9 w-32" />
                    <Skeleton className="h-9 w-40" />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index}>
                        <CardHeader className="pb-1 pt-4">
                            <Skeleton className="h-4 w-32" />
                        </CardHeader>
                        <CardContent className="space-y-2 pt-0 pb-4">
                            <Skeleton className="h-7 w-28" />
                            <Skeleton className="h-3 w-24" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-48" />
                </CardHeader>
                <CardContent className="space-y-4">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                            <div className="flex items-center space-x-4">
                                <Skeleton className="h-16 w-16 rounded-lg" />
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-40" />
                                    <Skeleton className="h-3 w-32" />
                                </div>
                            </div>
                            <Skeleton className="h-6 w-20" />
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

function DashboardStatCard({
    title,
    value,
    helper,
    icon,
    tone,
    action,
}: {
    title: string;
    value: string | number;
    helper: string;
    icon: ReactNode;
    tone: DashboardStatTone;
    action?: ReactNode;
}) {
    const classes = statToneClasses[tone];

    return (
        <Card className={`relative overflow-hidden rounded-3xl shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${classes.card}`}>
            <div className={`absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl ${classes.glow}`} />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
            <CardContent className="relative flex min-h-[156px] flex-col justify-between p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-600">{title}</p>
                        <p className={`mt-4 text-3xl font-bold tracking-tight ${classes.value}`}>
                            {value}
                        </p>
                    </div>
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-lg ${classes.icon}`}>
                        {icon}
                    </div>
                </div>
                <div className="mt-4 flex min-h-8 items-end justify-between gap-3">
                    <p className="text-sm font-medium text-slate-500">{helper}</p>
                    {action}
                </div>
            </CardContent>
        </Card>
    );
}

export default function DashboardPage() {
    const { locale, t } = useI18n();
    const isClient = useSyncExternalStore(
        noopSubscribe,
        () => true,
        () => false
    );
    const monthLabel = isClient
        ? formatLocalizedDate(new Date(), locale, { month: 'long', year: 'numeric' })
        : t('dashboard.currentMonth');
    const todayDateKey = isClient ? toLocalDateKey(new Date()) : '';
    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
        staleTime: 5 * 60_000,
    });
    const currentUser = currentUserQuery.data;
    const assistantPermissions = new Set(currentUser?.assistant_permissions ?? []);
    const canViewFinance = currentUser?.role === 'dentist';
    const canCreatePatients = Boolean(
        currentUser
        && (currentUser.role === 'dentist' || assistantPermissions.has('patients.manage'))
    );
    const canManageAppointments = Boolean(
        currentUser
        && (currentUser.role === 'dentist' || assistantPermissions.has('appointments.manage'))
    );

    const dashboardQuery = useQuery({
        queryKey: ['dashboard', 'snapshot', canViewFinance ? 'finance' : 'standard', todayDateKey],
        queryFn: () => getDashboardSnapshot({ includeFinancials: canViewFinance, date: todayDateKey }),
        enabled: Boolean(currentUser && todayDateKey),
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    if (!isClient || currentUserQuery.isLoading) {
        return <DashboardLoadingSkeleton />;
    }

    if (currentUserQuery.isError || !currentUser) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(currentUserQuery.error, t('dashboard.error'))}
                </p>
                <Button variant="outline" onClick={() => currentUserQuery.refetch()}>
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    if (dashboardQuery.isLoading) {
        return <DashboardLoadingSkeleton />;
    }

    if (dashboardQuery.isError || !dashboardQuery.data) {
        return (
            <div className="space-y-4">
                <p className="text-sm text-red-600">
                    {getApiErrorMessage(dashboardQuery.error, t('dashboard.error'))}
                </p>
                <Button variant="outline" onClick={() => dashboardQuery.refetch()}>
                    {t('common.retry')}
                </Button>
            </div>
        );
    }

    const stats = dashboardQuery.data;
    const nowTimeKey = isClient
        ? `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
        : '00:00';
    const allTodayAppointments = [...stats.todayAppointments]
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const scheduledTodayAppointments = allTodayAppointments
        .filter((appointment) => appointment.status === 'scheduled');
    const nowMinutes = toMinutesFromTime(nowTimeKey);
    const upcomingTodayAppointments = scheduledTodayAppointments
        .filter((appointment) => toMinutesFromTime(appointment.startTime) > nowMinutes);
    const startingSoonCount = upcomingTodayAppointments
        .filter((appointment) => {
            const appointmentMinutes = toMinutesFromTime(appointment.startTime);
            return appointmentMinutes < nowMinutes + 120;
        })
        .length;
    const pendingTodayCount = scheduledTodayAppointments.length;
    const noShowTodayCount = allTodayAppointments.filter((appointment) => appointment.status === 'no_show').length;
    const cancelledTodayCount = allTodayAppointments.filter((appointment) => appointment.status === 'cancelled').length;
    const visibleUpcomingAppointments = upcomingTodayAppointments.slice(0, 4);
    const showAllTodayHref = '/appointments';
    const viewAllDebtsLabel = t('dashboard.viewAllDebts')
        .replace(' ->', '')
        .replace('->', '')
        .trim();
    const debtTone: DashboardStatTone = stats.outstandingDebtTotal > 0 ? 'red' : 'green';
    const debtActionClassName = debtTone === 'red'
        ? 'h-8 rounded-full px-2 text-red-700 hover:bg-red-100 hover:text-red-800'
        : 'h-8 rounded-full px-2 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800';

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-4 rounded-3xl border border-white/70 bg-gradient-to-br from-white via-blue-50/35 to-white p-4 shadow-sm md:flex-row md:items-center md:justify-between md:p-5">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">
                        Identa
                    </p>
                    <h1 className="mt-1 text-[2rem] font-bold leading-tight text-slate-950 md:text-3xl">{t('dashboard.title')}</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        {monthLabel}
                    </p>
                </div>
                {(canCreatePatients || canManageAppointments) ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:justify-end">
                        {canCreatePatients ? (
                            <Link href="/patients?action=new">
                                <Button size="sm" className="h-10 w-full rounded-full px-4 shadow-sm md:w-auto">
                                    <Plus className="w-4 h-4 mr-2" />
                                    {t('dashboard.addPatient')}
                                </Button>
                            </Link>
                        ) : null}
                        {canManageAppointments ? (
                            <Link href="/appointments?action=new">
                                <Button variant="outline" size="sm" className="h-10 w-full rounded-full border-blue-100 bg-white px-4 shadow-sm hover:bg-blue-50 md:w-auto">
                                    <Calendar className="w-4 h-4 mr-2" />
                                    {t('dashboard.newAppointment')}
                                </Button>
                            </Link>
                        ) : null}
                    </div>
                ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {canViewFinance ? (
                    <>
                        <DashboardStatCard
                            title={t('dashboard.todayAppointments')}
                            value={scheduledTodayAppointments.length}
                            helper={scheduledTodayAppointments.length === 0 ? t('dashboard.noAppointments') : t('dashboard.scheduled')}
                            tone="blue"
                            icon={<Calendar className="h-5 w-5" />}
                            action={(
                                <Button asChild variant="ghost" size="sm" className="h-8 rounded-full px-2 text-blue-700 hover:bg-blue-100 hover:text-blue-800">
                                    <Link href="/appointments" aria-label={t('dashboard.todayAppointments')}>
                                        <ArrowRight className="h-4 w-4" />
                                    </Link>
                                </Button>
                            )}
                        />

                        <DashboardStatCard
                            title={t('dashboard.revenueThisMonth')}
                            value={formatCurrency(stats.revenueThisMonth)}
                            helper={monthLabel}
                            tone="green"
                            icon={<DollarSign className="h-5 w-5" />}
                        />

                        <DashboardStatCard
                            title={t('dashboard.outstandingDebts')}
                            value={formatCurrency(stats.outstandingDebtTotal)}
                            helper={viewAllDebtsLabel}
                            tone={debtTone}
                            icon={<AlertCircle className="h-5 w-5" />}
                            action={(
                                <Button asChild variant="ghost" size="sm" className={debtActionClassName}>
                                    <Link href="/payments" aria-label={viewAllDebtsLabel}>
                                        <ArrowRight className="h-4 w-4" />
                                    </Link>
                                </Button>
                            )}
                        />
                    </>
                ) : (
                    <>
                        <DashboardStatCard
                            title={t('dashboard.pendingToday')}
                            value={pendingTodayCount}
                            helper={t('dashboard.scheduled')}
                            tone="blue"
                            icon={<Calendar className="h-5 w-5" />}
                        />

                        <DashboardStatCard
                            title={t('dashboard.startingSoon')}
                            value={startingSoonCount}
                            helper={t('dashboard.nextTwoHours')}
                            tone="amber"
                            icon={<Clock3 className="h-5 w-5" />}
                        />

                        <DashboardStatCard
                            title={t('dashboard.cancelledNoShowToday')}
                            value={`${noShowTodayCount} / ${cancelledTodayCount}`}
                            helper={`${t('dashboard.noShowLabel')} / ${t('dashboard.cancelledLabel')}`}
                            tone="red"
                            icon={<AlertCircle className="h-5 w-5" />}
                        />
                    </>
                )}
            </div>

            <Card className="overflow-hidden rounded-3xl border-blue-100 bg-gradient-to-br from-white via-slate-50 to-blue-50/70 shadow-sm">
                <CardHeader className="pb-3 pt-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">
                                {t('dashboard.todayAppointments')}
                            </p>
                            <CardTitle className="mt-2 text-2xl tracking-tight text-slate-950">
                                {t('dashboard.upcomingToday')}
                            </CardTitle>
                        </div>
                        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm">
                            <Calendar className="h-4 w-4 text-blue-600" />
                            {scheduledTodayAppointments.length} {t('dashboard.scheduled')}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pb-5 pt-0">
                    {scheduledTodayAppointments.length === 0 ? (
                        <div className="flex flex-col gap-4 rounded-2xl border border-dashed border-blue-200 bg-white/70 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50">
                                    <Calendar className="h-5 w-5 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">{t('dashboard.noAppointmentsToday')}</p>
                                    <p className="mt-1 text-sm text-slate-500">{t('dashboard.scheduleAppointment')}</p>
                                </div>
                            </div>
                            <Link href="/appointments?action=new" className="sm:shrink-0">
                                <Button size="sm" className="w-full rounded-full sm:w-auto">
                                    {t('dashboard.scheduleAppointment')}
                                </Button>
                            </Link>
                        </div>
                    ) : upcomingTodayAppointments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-100 bg-white/75 px-4 py-10 text-center">
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                                <CheckCircle2 className="h-6 w-6" />
                            </div>
                            <p className="text-sm font-semibold text-slate-900">{t('dashboard.noMoreUpcoming')}</p>
                            <Link href={showAllTodayHref}>
                                <Button variant="outline" className="mt-4 rounded-full">
                                    {t('dashboard.showAllToday', { count: scheduledTodayAppointments.length })}
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {visibleUpcomingAppointments.map((appointment) => {
                                    const translatedStatus = t(`status.${appointment.status}`);
                                    const statusLabel = translatedStatus.startsWith('status.')
                                        ? appointment.status
                                        : translatedStatus;
                                    const statusTone = getStatusTone(appointment.status);

                                    return (
                                        <div
                                            key={appointment.id}
                                            className="group rounded-2xl border border-white/80 bg-white/90 p-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-md"
                                        >
                                            <div className="mb-3 flex items-start justify-between gap-3">
                                                <div className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-blue-600 px-3 py-2 leading-none text-white shadow-sm shadow-blue-200">
                                                    <span className="text-[13px] font-bold">
                                                        {formatAppointmentHourMinute(appointment.startTime)}
                                                    </span>
                                                    <span className="mt-1 text-[10px] text-blue-100">
                                                        {t('dashboard.minutesShort', { count: appointment.durationMinutes })}
                                                    </span>
                                                </div>
                                                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-semibold shadow-xs ${statusTone.text}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${statusTone.dot}`} />
                                                    {statusLabel}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-bold leading-tight text-slate-950" title={appointment.patientName}>
                                                    {truncateForUi(appointment.patientName, DASHBOARD_NAME_UI_LIMIT)}
                                                </p>
                                                <p className="mt-1 truncate text-xs font-medium text-slate-500">
                                                    {truncateForUi(appointment.reason || t('dashboard.generalAppointment'), DASHBOARD_REASON_UI_LIMIT)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-white/75 p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                                        <Calendar className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-950">{t('dashboard.todayAppointments')}</p>
                                        <p className="mt-1 text-sm text-slate-500">
                                            {scheduledTodayAppointments.length} {t('dashboard.scheduled')}
                                        </p>
                                    </div>
                                </div>
                                <Link href={showAllTodayHref}>
                                    <Button variant="outline" size="sm" className="w-full rounded-full bg-white sm:w-auto">
                                        {t('dashboard.showAllToday', { count: scheduledTodayAppointments.length })}
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

        </div>
    );
}
