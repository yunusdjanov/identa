'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentUser, getDashboardSnapshot } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { formatCurrency, formatTime, truncateForUi } from '@/lib/utils';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { Plus, Calendar, Clock3, DollarSign, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/components/providers/i18n-provider';

const noopSubscribe = () => () => undefined;
const DASHBOARD_NAME_UI_LIMIT = 25;
const DASHBOARD_REASON_UI_LIMIT = 40;

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

function DashboardLoadingSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-40" />
                    <Skeleton className="h-4 w-72" />
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Array.from({ length: 2 }).map((_, index) => (
                    <Card key={index}>
                        <CardHeader>
                            <Skeleton className="h-6 w-40" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-4 w-full" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
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
        queryKey: ['dashboard', 'snapshot', canViewFinance ? 'finance' : 'standard'],
        queryFn: () => getDashboardSnapshot({ includeFinancials: canViewFinance }),
        enabled: Boolean(currentUser),
    });

    if (currentUserQuery.isLoading) {
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
    const upcomingTodayAppointments = scheduledTodayAppointments
        .filter((appointment) => appointment.startTime >= nowTimeKey);
    const nowMinutes = toMinutesFromTime(nowTimeKey);
    const startingSoonCount = upcomingTodayAppointments
        .filter((appointment) => {
            const appointmentMinutes = toMinutesFromTime(appointment.startTime);
            return appointmentMinutes < nowMinutes + 120;
        })
        .length;
    const pendingTodayCount = upcomingTodayAppointments.length;
    const noShowTodayCount = allTodayAppointments.filter((appointment) => appointment.status === 'no_show').length;
    const cancelledTodayCount = allTodayAppointments.filter((appointment) => appointment.status === 'cancelled').length;
    const visibleUpcomingAppointments = upcomingTodayAppointments.slice(0, 3);
    const showAllTodayHref = '/appointments';

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-[2rem] font-bold leading-tight text-gray-900 md:text-3xl">{t('dashboard.title')}</h1>
                </div>
                {(canCreatePatients || canManageAppointments) ? (
                    <div className="flex flex-wrap gap-2">
                        {canCreatePatients ? (
                            <Link href="/patients?action=new">
                                <Button size="sm">
                                    <Plus className="w-4 h-4 mr-2" />
                                    {t('dashboard.addPatient')}
                                </Button>
                            </Link>
                        ) : null}
                        {canManageAppointments ? (
                            <Link href="/appointments?action=new">
                                <Button variant="outline" size="sm">
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
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3.5">
                                <CardTitle className="text-sm font-medium text-gray-600">
                                    {t('dashboard.revenueThisMonth')}
                                </CardTitle>
                                <DollarSign className="w-4 h-4 text-green-600" />
                            </CardHeader>
                            <CardContent className="pt-0 pb-3.5">
                                <div className="text-2xl font-bold text-gray-900">
                                    {formatCurrency(stats.revenueThisMonth)}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    {monthLabel}
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3.5">
                                <CardTitle className="text-sm font-medium text-gray-600">
                                    {t('dashboard.outstandingDebts')}
                                </CardTitle>
                                <AlertCircle className="w-4 h-4 text-red-600" />
                            </CardHeader>
                            <CardContent className="pt-0 pb-3.5">
                                <div className="text-2xl font-bold text-gray-900">
                                    {formatCurrency(stats.outstandingDebtTotal)}
                                </div>
                                <Button
                                    asChild
                                    variant="ghost"
                                    size="sm"
                                    className="mt-2 h-8 w-fit px-2 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                                >
                                    <Link href="/payments">{t('dashboard.viewAllDebts')}</Link>
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3.5">
                                <CardTitle className="text-sm font-medium text-gray-600">
                                    {t('dashboard.todayAppointments')}
                                </CardTitle>
                                <Calendar className="w-4 h-4 text-blue-600" />
                            </CardHeader>
                            <CardContent className="pt-0 pb-3.5">
                                <div className="text-2xl font-bold text-gray-900">
                                    {scheduledTodayAppointments.length}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    {scheduledTodayAppointments.length === 0 ? t('dashboard.noAppointments') : t('dashboard.scheduled')}
                                </p>
                            </CardContent>
                        </Card>
                    </>
                ) : (
                    <>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3.5">
                                <CardTitle className="text-sm font-medium text-gray-600">
                                    {t('dashboard.pendingToday')}
                                </CardTitle>
                                <Calendar className="w-4 h-4 text-blue-600" />
                            </CardHeader>
                            <CardContent className="pt-0 pb-3.5">
                                <div className="text-2xl font-bold text-gray-900">
                                    {pendingTodayCount}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{t('dashboard.scheduled')}</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3.5">
                                <CardTitle className="text-sm font-medium text-gray-600">
                                    {t('dashboard.startingSoon')}
                                </CardTitle>
                                <Clock3 className="w-4 h-4 text-amber-600" />
                            </CardHeader>
                            <CardContent className="pt-0 pb-3.5">
                                <div className="text-2xl font-bold text-gray-900">
                                    {startingSoonCount}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{t('dashboard.nextTwoHours')}</p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3.5">
                                <CardTitle className="text-sm font-medium text-gray-600">
                                    {t('dashboard.cancelledNoShowToday')}
                                </CardTitle>
                                <AlertCircle className="w-4 h-4 text-red-600" />
                            </CardHeader>
                            <CardContent className="space-y-2 pt-0 pb-3.5">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-500">{t('dashboard.noShowLabel')}</span>
                                    <span className="font-semibold text-gray-900">{noShowTodayCount}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-gray-500">{t('dashboard.cancelledLabel')}</span>
                                    <span className="font-semibold text-gray-900">{cancelledTodayCount}</span>
                                </div>
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>

            <Card>
                <CardHeader className="pb-1 pt-4">
                    <CardTitle>{t('dashboard.upcomingToday')}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                    {scheduledTodayAppointments.length === 0 ? (
                        <div className="flex flex-col gap-4 rounded-lg border border-dashed border-gray-200 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-50">
                                    <Calendar className="h-5 w-5 text-gray-300" />
                                </div>
                                <p className="text-sm text-gray-500">{t('dashboard.noAppointmentsToday')}</p>
                            </div>
                            <Link href="/appointments?action=new" className="sm:shrink-0">
                                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                                    {t('dashboard.scheduleAppointment')}
                                </Button>
                            </Link>
                        </div>
                    ) : upcomingTodayAppointments.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-sm text-gray-500">{t('dashboard.noMoreUpcoming')}</p>
                            <Link href={showAllTodayHref}>
                                <Button variant="outline" className="mt-4">
                                    {t('dashboard.showAllToday', { count: scheduledTodayAppointments.length })}
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
                                {visibleUpcomingAppointments.map((appointment) => {
                                    const translatedStatus = t(`status.${appointment.status}`);
                                    const statusLabel = translatedStatus.startsWith('status.')
                                        ? appointment.status
                                        : translatedStatus;
                                    const statusTone = getStatusTone(appointment.status);

                                    return (
                                        <div
                                            key={appointment.id}
                                            className="rounded-md border border-gray-200 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="mb-2 flex items-start justify-between gap-2">
                                                <div className="flex shrink-0 flex-col items-center justify-center rounded-md bg-blue-50 px-2 py-1.5 leading-none">
                                                    <span className="text-sm font-semibold text-blue-700">
                                                        {formatTime(appointment.startTime)}
                                                    </span>
                                                    <span className="mt-1 text-[11px] text-gray-500">
                                                        {t('dashboard.minutesShort', { count: appointment.durationMinutes })}
                                                    </span>
                                                </div>
                                                <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${statusTone.text}`}>
                                                    <span className={`h-1.5 w-1.5 rounded-full ${statusTone.dot}`} />
                                                    {statusLabel}
                                                </span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium leading-tight text-gray-900" title={appointment.patientName}>
                                                    {truncateForUi(appointment.patientName, DASHBOARD_NAME_UI_LIMIT)}
                                                </p>
                                                <p className="mt-1 truncate text-xs text-gray-500">
                                                    {truncateForUi(appointment.reason || t('dashboard.generalAppointment'), DASHBOARD_REASON_UI_LIMIT)}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="pt-1">
                                <Link href={showAllTodayHref}>
                                    <Button variant="outline" size="sm" className="w-full">
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
