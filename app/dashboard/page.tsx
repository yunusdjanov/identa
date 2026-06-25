'use client';

import type { ReactNode } from 'react';
import { useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RouteDashboardLoadingState } from '@/components/layout/page-loading-skeletons';
import { getCurrentUser, getDashboardSnapshot } from '@/lib/api/dentist';
import { getApiErrorMessage } from '@/lib/api/client';
import { formatCurrency, toLocalDateKey, truncateForUi } from '@/lib/utils';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { AlertCircle, ArrowRight, Calendar, CheckCircle2, DollarSign, Eye, EyeOff, Lock, Plus } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/components/providers/i18n-provider';
import { AppErrorState } from '@/components/error/app-error-state';
import { canManage, canView, getManageDeniedMessage, isSubscriptionReadOnly } from '@/lib/auth/permissions';
import { getStatusTone } from '@/lib/appointments/status-tone';
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
        icon: 'bg-white text-blue-600 ring-blue-200',
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
    headerAction,
}: {
    title: string;
    value: string | number;
    helper: string;
    icon: ReactNode;
    tone: DashboardStatTone;
    action?: ReactNode;
    headerAction?: ReactNode;
}) {
    const classes = statToneClasses[tone];

    return (
        <Card className={`interactive-card metric-hover-card ${classes.hover} rounded-2xl shadow-sm ${classes.card}`}>
            <CardContent className="relative px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-400">{title}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {headerAction}
                        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${classes.icon}`}>
                            {icon}
                        </div>
                    </div>
                </div>
                <p className={`mt-1.5 truncate text-2xl font-bold leading-none tracking-tight ${classes.value}`}>
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

function FinancialPrivacyToggle({
    isHidden,
    label,
    onToggle,
}: {
    isHidden: boolean;
    label: string;
    onToggle: () => void;
}) {
    const Icon = isHidden ? EyeOff : Eye;

    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onToggle}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/75 text-slate-500 ring-1 ring-white/80 transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-200"
        >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
    );
}

function LockedStatCard({ title, icon }: { title: string; icon: ReactNode }) {
    const { t } = useI18n();
    // Locked-state KPI mirrors the unlocked StatCard's structure so cards
    // line up in the row at the same height:
    //   eyebrow (title)      icon
    //   <value placeholder>
    //   <helper>             —
    //
    // Previously the value slot rendered the full Uzbek denied-message
    // ("Sizda bu boʻlimga kirish uchun ruxsat yoʻq") at `text-2xl font-bold`,
    // producing a Uzbek paragraph that drowned the card even when the user
    // had set the app to Russian. The new shape — small Lock + locale-aware
    // "No access" label — keeps the typographic hierarchy (value-row is
    // big and dim, helper-row is small) without leaking a hardcoded
    // language and without overpowering siblings in the grid.
    return (
        <Card className="rounded-2xl border-slate-200/70 bg-white shadow-sm">
            <CardContent className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-400">{title}</p>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-300 ring-1 ring-slate-100">
                        {icon}
                    </div>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-2xl font-bold leading-none tracking-tight text-slate-300">
                    <Lock className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t('dashboard.lockedKpi.label')}</span>
                </div>
                <p className="mt-2 truncate text-[11px] font-medium text-slate-400">
                    {t('dashboard.lockedKpi.helper')}
                </p>
            </CardContent>
        </Card>
    );
}

export default function DashboardPage() {
    const { locale, t } = useI18n();
    const [areFinancialStatsHidden, setAreFinancialStatsHidden] = useState(false);
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
    const denyManageAction = () => toast.error(getManageDeniedMessage(currentUser, t));

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
    // Outstanding debt always uses the red tone — it's a "money owed" category,
    // so the card stays red even at 0 (product decision).
    const debtTone: DashboardStatTone = 'red';
    const debtActionClassName = 'h-6 rounded-full px-1.5 text-red-700 hover:bg-red-100 hover:text-red-800';
    const financialPrivacyLabel = areFinancialStatsHidden
        ? t('dashboard.privacy.showFinancials')
        : t('dashboard.privacy.hideFinancials');
    const renderFinancialPrivacyToggle = () => (
        <FinancialPrivacyToggle
            isHidden={areFinancialStatsHidden}
            label={financialPrivacyLabel}
            onToggle={() => setAreFinancialStatsHidden((current) => !current)}
        />
    );
    const formatFinancialStatValue = (amount?: number) => {
        if (!stats) {
            return '...';
        }

        return areFinancialStatsHidden ? '***' : formatCurrency(amount ?? 0);
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-col gap-3 rounded-2xl border border-white/70 bg-white px-4 py-3.5 shadow-sm md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-600">Identa</p>
                    <h1 className="mt-0.5 text-2xl font-bold leading-tight text-slate-950">{t('dashboard.title')}</h1>
                    <p className="text-xs text-slate-500">{monthLabel}</p>
                </div>
                {/* AF5: hide-not-disable for permission shortfalls; show
                    disabled + toast for subscription read-only (so dentist
                    owner knows it's a billing pause, not a permission
                    gap). View-only assistant who never has create rights
                    sees no CTA at all instead of a permanently dimmed
                    button next to a working sibling. */}
                {(canCreatePatients || canManageAppointments || (isSubscriptionReadOnly(currentUser) && (canViewPatients || canViewAppointments))) ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:flex-wrap md:justify-end">
                        {canCreatePatients ? (
                            <Link href="/patients?action=new">
                                <Button
                                    size="sm"
                                    className="h-8 w-full rounded-full px-3 shadow-sm md:w-auto"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                                    {t('dashboard.addPatient')}
                                </Button>
                            </Link>
                        ) : isSubscriptionReadOnly(currentUser) && canViewPatients ? (
                            <Button
                                size="sm"
                                className="h-8 w-full rounded-full px-3 shadow-sm md:w-auto"
                                disabled
                                onClick={denyManageAction}
                            >
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                {t('dashboard.addPatient')}
                            </Button>
                        ) : null}
                        {canManageAppointments ? (
                            <Link href="/appointments?action=new">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-full rounded-full border-teal-100 bg-white px-3 shadow-sm hover:bg-teal-50 md:w-auto"
                                >
                                    <Calendar className="w-3.5 h-3.5 mr-1.5" />
                                    {t('dashboard.newAppointment')}
                                </Button>
                            </Link>
                        ) : isSubscriptionReadOnly(currentUser) && canViewAppointments ? (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-full rounded-full border-teal-100 bg-white px-3 shadow-sm hover:bg-teal-50 md:w-auto"
                                disabled
                                onClick={denyManageAction}
                            >
                                <Calendar className="w-3.5 h-3.5 mr-1.5" />
                                {t('dashboard.newAppointment')}
                            </Button>
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
                        value={formatFinancialStatValue(stats?.revenueThisMonth)}
                        helper={monthLabel}
                        tone="green"
                        icon={<DollarSign className="h-3.5 w-3.5" />}
                        headerAction={renderFinancialPrivacyToggle()}
                    />
                ) : (
                    <LockedStatCard title={t('dashboard.revenueThisMonth')} icon={<DollarSign className="h-3.5 w-3.5" />} />
                )}

                {canViewPayments ? (
                    <DashboardStatCard
                        title={t('dashboard.outstandingDebts')}
                        value={formatFinancialStatValue(stats?.outstandingDebtTotal)}
                        helper={viewAllDebtsLabel}
                        tone={debtTone}
                        icon={<AlertCircle className="h-3.5 w-3.5" />}
                        headerAction={renderFinancialPrivacyToggle()}
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
                        <Button asChild variant="ghost" size="sm" className="h-7 gap-1 rounded-full bg-teal-50 px-2.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-50 hover:text-teal-700">
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
                        <Lock className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-500">
                                {t('dashboard.lockedKpi.label')}
                            </p>
                            <p className="truncate text-[11px] text-slate-400">
                                {t('dashboard.lockedKpi.helper')}
                            </p>
                        </div>
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
                        {/* AF5: don't show a "Schedule appointment" CTA the
                            view-only assistant can't act on. Subscription
                            read-only still shows the disabled state so the
                            dentist owner sees why it's paused. */}
                        {canManageAppointments ? (
                            <Button asChild size="sm" className="h-7 shrink-0 rounded-full px-3 text-xs">
                                <Link href="/appointments?action=new">
                                    {t('dashboard.scheduleAppointment')}
                                </Link>
                            </Button>
                        ) : isSubscriptionReadOnly(currentUser) && canViewAppointments ? (
                            <Button
                                size="sm"
                                className="h-7 shrink-0 rounded-full px-3 text-xs"
                                disabled
                                onClick={denyManageAction}
                            >
                                {t('dashboard.scheduleAppointment')}
                            </Button>
                        ) : null}
                    </div>
                ) : upcomingTodayAppointments.length === 0 ? (
                    <div className="flex items-center gap-2.5 px-4 py-4">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        <p className="text-sm font-semibold text-slate-700">{t('dashboard.noMoreUpcoming')}</p>
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
