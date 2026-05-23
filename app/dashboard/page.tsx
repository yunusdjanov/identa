'use client';

import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RouteDashboardLoadingState } from '@/components/layout/page-loading-skeletons';
import { getCurrentUser, getDashboardSnapshot } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { formatCurrency, toLocalDateKey, truncateForUi } from '@/lib/utils';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { AlertCircle, ArrowRight, Calendar, CheckCircle2, DollarSign, Plus } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/components/providers/i18n-provider';
import { AppErrorState } from '@/components/error/app-error-state';
import { canManage, canView, getManageDeniedMessage, PERMISSION_DENIED_MESSAGE } from '@/lib/auth/permissions';
import { toast } from 'sonner';

const noopSubscribe = () => () => undefined;
const DASHBOARD_NAME_UI_LIMIT = 25;
const DASHBOARD_REASON_UI_LIMIT = 40;

type DashboardStatTone = 'teal' | 'green' | 'red' | 'amber';

const statToneClasses: Record<DashboardStatTone, {
    card: string;
    icon: string;
    value: string;
    hover: string;
}> = {
    teal: {
        card: 'border-blue-200 bg-gradient-to-br from-blue-50 via-blue-100/70 to-white shadow-blue-200/60',
        icon: 'bg-white/80 text-blue-600 ring-blue-200',
        value: 'text-blue-900',
        hover: 'metric-hover-blue',
    },
    green: {
        card: 'border-emerald-100 bg-gradient-to-br from-white via-emerald-50/60 to-white shadow-emerald-100/50',
        icon: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
        value: 'text-emerald-900',
        hover: 'metric-hover-emerald',
    },
    red: {
        card: 'border-red-100 bg-gradient-to-br from-white via-red-50/60 to-white shadow-red-100/50',
        icon: 'bg-red-50 text-red-600 ring-red-100',
        value: 'text-red-900',
        hover: 'metric-hover-red',
    },
    amber: {
        card: 'border-amber-100 bg-gradient-to-br from-white via-amber-50/60 to-white shadow-amber-100/50',
        icon: 'bg-amber-50 text-amber-600 ring-amber-100',
        value: 'text-amber-900',
        hover: 'metric-hover-amber',
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
            return { dot: 'bg-teal-600', text: 'text-teal-700' };
    }
}

function toMinutesFromTime(timeInput: string): number {
    const [hours, minutes] = timeInput.split(':').map(Number);
    return hours * 60 + minutes;
}

function formatAppointmentHourMinute(timeInput: string): string {
    return timeInput.slice(0, 5);
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
        <Card className={`interactive-card metric-hover-card ${classes.hover} rounded-2xl shadow-sm ${classes.card}`}>
            <CardContent className="relative px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-400">{title}</p>
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ${classes.icon}`}>
                        {icon}
                    </div>
                </div>
                <p className={`mt-1.5 truncate text-[1.4rem] font-bold leading-none tracking-tight ${classes.value}`}>
                    {value}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-medium text-slate-400">{helper}</p>
                    {action}
                </div>
            </CardContent>
        </Card>
    );
}

function LockedStatCard({ title, icon }: { title: string; icon: ReactNode }) {
    return (
        <Card className="rounded-2xl border-slate-100 bg-gradient-to-br from-white via-slate-50/60 to-white shadow-sm">
            <CardContent className="relative overflow-hidden px-4 py-3.5">
                <div className="pointer-events-none absolute inset-0 bg-white/40 backdrop-blur-[1.5px]" />
                <div className="relative flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-300">{title}</p>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-300 ring-1 ring-slate-100">
                        {icon}
                    </div>
                </div>
                <p className="relative mt-1.5 text-[1.4rem] font-bold leading-none text-slate-200">{PERMISSION_DENIED_MESSAGE}</p>
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
    const canViewPatients = canView(currentUser, 'patients');
    const canCreatePatients = canManage(currentUser, 'patients');
    const canViewAppointments = canView(currentUser, 'appointments');
    const canManageAppointments = canManage(currentUser, 'appointments');
    const canViewPayments = canView(currentUser, 'payments');
    const denyManageAction = () => toast.error(getManageDeniedMessage(currentUser));

    const dashboardQuery = useQuery({
        queryKey: ['dashboard', 'snapshot', todayDateKey],
        queryFn: () => getDashboardSnapshot({ date: todayDateKey }),
        enabled: Boolean(todayDateKey),
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    if (!isClient || currentUserQuery.isLoading) {
        return <RouteDashboardLoadingState />;
    }

    if (currentUserQuery.isError || !currentUser) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(currentUserQuery.error, t('dashboard.error'))}
                retryLabel={t('common.retry')}
                onRetry={() => currentUserQuery.refetch()}
            />
        );
    }

    if (dashboardQuery.isError && !dashboardQuery.data) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(dashboardQuery.error, t('dashboard.error'))}
                retryLabel={t('common.retry')}
                onRetry={() => dashboardQuery.refetch()}
            />
        );
    }

    const stats = dashboardQuery.data;
    const isDashboardLoading = dashboardQuery.isLoading && !stats;
    if (isDashboardLoading) {
        return <RouteDashboardLoadingState />;
    }

    const nowTimeKey = isClient
        ? `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`
        : '00:00';
    const allTodayAppointments = [...(stats?.todayAppointments ?? [])]
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const scheduledTodayAppointments = allTodayAppointments
        .filter((appointment) => appointment.status === 'scheduled');
    const nowMinutes = toMinutesFromTime(nowTimeKey);
    const upcomingTodayAppointments = scheduledTodayAppointments
        .filter((appointment) => toMinutesFromTime(appointment.startTime) > nowMinutes);
    const visibleUpcomingAppointments = upcomingTodayAppointments.slice(0, 4);
    const showAllTodayHref = '/appointments';
    const viewAllDebtsLabel = t('dashboard.viewAllDebts')
        .replace(' ->', '')
        .replace('->', '')
        .trim();
    const debtTone: DashboardStatTone = (stats?.outstandingDebtTotal ?? 0) > 0 ? 'red' : 'green';
    const debtActionClassName = debtTone === 'red'
        ? 'h-6 rounded-full px-1.5 text-red-700 hover:bg-red-100 hover:text-red-800'
        : 'h-6 rounded-full px-1.5 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800';

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/70 bg-gradient-to-br from-white via-teal-100/35 to-white px-4 py-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-600">Identa</p>
                    <h1 className="mt-0.5 text-2xl font-bold leading-tight text-slate-950">{t('dashboard.title')}</h1>
                    <p className="text-xs text-slate-500">{monthLabel}</p>
                </div>
                {(canViewPatients || canViewAppointments) ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:justify-end">
                        {canViewPatients ? (
                            <Link
                                href="/patients?action=new"
                                onClick={(event) => {
                                    if (!canCreatePatients) {
                                        event.preventDefault();
                                        denyManageAction();
                                    }
                                }}
                            >
                                <Button
                                    size="sm"
                                    className="h-8 w-full rounded-full px-3 shadow-sm md:w-auto"
                                    disabled={!canCreatePatients}
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                                    {t('dashboard.addPatient')}
                                </Button>
                            </Link>
                        ) : null}
                        {canViewAppointments ? (
                            <Link
                                href="/appointments?action=new"
                                onClick={(event) => {
                                    if (!canManageAppointments) {
                                        event.preventDefault();
                                        denyManageAction();
                                    }
                                }}
                            >
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-full rounded-full border-teal-100 bg-white px-3 shadow-sm hover:bg-teal-50 md:w-auto"
                                    disabled={!canManageAppointments}
                                >
                                    <Calendar className="w-3.5 h-3.5 mr-1.5" />
                                    {t('dashboard.newAppointment')}
                                </Button>
                            </Link>
                        ) : null}
                    </div>
                ) : null}
            </div>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                {canViewAppointments ? (
                    <DashboardStatCard
                        title={t('dashboard.todayAppointments')}
                        value={scheduledTodayAppointments.length}
                        helper={scheduledTodayAppointments.length === 0 ? t('dashboard.noAppointments') : t('dashboard.scheduled')}
                        tone="teal"
                        icon={<Calendar className="h-3.5 w-3.5" />}
                        action={(
                            <Button asChild variant="ghost" size="sm" className="h-6 rounded-full px-1.5 text-teal-700 hover:bg-teal-100 hover:text-teal-800">
                                <Link href="/appointments" aria-label={t('dashboard.todayAppointments')}>
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </Button>
                        )}
                    />
                ) : (
                    <LockedStatCard title={t('dashboard.todayAppointments')} icon={<Calendar className="h-3.5 w-3.5" />} />
                )}

                {canViewPayments ? (
                    <DashboardStatCard
                        title={t('dashboard.revenueThisMonth')}
                        value={stats ? formatCurrency(stats.revenueThisMonth) : '...'}
                        helper={monthLabel}
                        tone="green"
                        icon={<DollarSign className="h-3.5 w-3.5" />}
                    />
                ) : (
                    <LockedStatCard title={t('dashboard.revenueThisMonth')} icon={<DollarSign className="h-3.5 w-3.5" />} />
                )}

                {canViewPayments ? (
                    <DashboardStatCard
                        title={t('dashboard.outstandingDebts')}
                        value={stats ? formatCurrency(stats.outstandingDebtTotal) : '...'}
                        helper={viewAllDebtsLabel}
                        tone={debtTone}
                        icon={<AlertCircle className="h-3.5 w-3.5" />}
                        action={(
                            <Button asChild variant="ghost" size="sm" className={debtActionClassName}>
                                <Link href="/payments" aria-label={viewAllDebtsLabel}>
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </Button>
                        )}
                    />
                ) : (
                    <LockedStatCard title={t('dashboard.outstandingDebts')} icon={<AlertCircle className="h-3.5 w-3.5" />} />
                )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 ring-1 ring-teal-100">
                            <Calendar className="h-3.5 w-3.5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-500">{t('dashboard.todayAppointments')}</p>
                            <p className="text-sm font-bold leading-tight text-slate-900">{t('dashboard.upcomingToday')}</p>
                        </div>
                    </div>
                    {canViewAppointments && scheduledTodayAppointments.length > 0 && (
                        <Button asChild variant="ghost" size="sm" className="h-7 gap-1 rounded-full px-2.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 hover:text-teal-800">
                            <Link href={showAllTodayHref}>
                                {t('dashboard.showAllToday', { count: scheduledTodayAppointments.length })}
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                        </Button>
                    )}
                </div>

                {/* Body */}
                {!canViewAppointments ? (
                    <div className="flex items-center gap-3 px-4 py-4">
                        <Calendar className="h-4 w-4 shrink-0 text-slate-300" />
                        <p className="text-sm font-medium text-slate-400">{PERMISSION_DENIED_MESSAGE}</p>
                    </div>
                ) : scheduledTodayAppointments.length === 0 ? (
                    <div className="flex items-center justify-between gap-4 px-4 py-4">
                        <div className="flex items-center gap-2.5">
                            <Calendar className="h-4 w-4 shrink-0 text-teal-400" />
                            <div>
                                <p className="text-sm font-semibold text-slate-700">{t('dashboard.noAppointmentsToday')}</p>
                                <p className="text-[11px] text-slate-400">{t('dashboard.scheduleAppointment')}</p>
                            </div>
                        </div>
                        <Button
                            asChild
                            size="sm"
                            className="h-7 shrink-0 rounded-full px-3 text-xs"
                            disabled={!canManageAppointments}
                        >
                            <Link
                                href="/appointments?action=new"
                                onClick={(event) => {
                                    if (!canManageAppointments) { event.preventDefault(); denyManageAction(); }
                                }}
                            >
                                {t('dashboard.scheduleAppointment')}
                            </Link>
                        </Button>
                    </div>
                ) : upcomingTodayAppointments.length === 0 ? (
                    <div className="flex items-center gap-2.5 px-4 py-4">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        <p className="text-sm font-semibold text-slate-700">{t('dashboard.noMoreUpcoming')}</p>
                        <Button asChild variant="ghost" size="sm" className="ml-auto h-7 rounded-full px-2.5 text-xs text-teal-700 hover:bg-teal-50">
                            <Link href={showAllTodayHref}>{t('dashboard.showAllToday', { count: scheduledTodayAppointments.length })}</Link>
                        </Button>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100/80">
                        {visibleUpcomingAppointments.map((appointment) => {
                            const translatedStatus = t(`status.${appointment.status}`);
                            const statusLabel = translatedStatus.startsWith('status.') ? appointment.status : translatedStatus;
                            const statusTone = getStatusTone(appointment.status);
                            return (
                                <div key={appointment.id} className="flex items-center gap-3 px-4 py-2.5">
                                    <time className="flex h-8 w-[3.8rem] shrink-0 items-center justify-center rounded-xl bg-teal-50 text-[13px] font-bold tabular-nums text-teal-700 ring-1 ring-teal-100">
                                        {formatAppointmentHourMinute(appointment.startTime)}
                                    </time>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-slate-900">{truncateForUi(appointment.patientName, DASHBOARD_NAME_UI_LIMIT)}</p>
                                        <p className="truncate text-[11px] text-slate-400">
                                            {truncateForUi(appointment.reason || t('dashboard.generalAppointment'), DASHBOARD_REASON_UI_LIMIT)}
                                            {' · '}
                                            {t('dashboard.minutesShort', { count: appointment.durationMinutes })}
                                        </p>
                                    </div>
                                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold ${statusTone.text}`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${statusTone.dot}`} />
                                        {statusLabel}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

        </div>
    );
}
