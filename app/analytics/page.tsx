'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CheckCircle2, Download, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api/client';
import {
    getAnalyticsSummary,
    getCurrentUser,
} from '@/lib/api/dentist';
import { useI18n } from '@/components/providers/i18n-provider';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { canView } from '@/lib/auth/permissions';
import { AnalyticsLoadingState } from '@/components/layout/page-loading-skeletons';
import {
    AppointmentStatusChart,
    PatientGrowthChart,
    RevenueChart,
    TopDebtorsCard,
} from '@/components/dashboard/dashboard-charts';
import { cn, formatCurrency } from '@/lib/utils';
import { KpiCard } from '@/components/analytics/kpi-card';
import {
    type AnalyticsRange,
    DEFAULT_ANALYTICS_RANGE,
    getPreviousRangeBounds,
    getRangeBounds,
    TimeRangeSelector,
} from '@/components/analytics/time-range-selector';
import { buildChartBuckets } from '@/lib/analytics/chart-buckets';
import { buildPdfFilename, exportRowsToPdf } from '@/lib/export/pdf';
import { formatLocalizedDate, getActiveDisplayLocale } from '@/lib/i18n/date';
import type { ApiMoneyCurrency } from '@/lib/api/types';

function formatApiDate(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function computeDelta(current: number, previous: number): number | null {
    // (0, 0) used to return 0 — which renders as a literal "0%" with a neutral
    // arrow and reads as "no change". That's misleading when there's actually
    // no data on either side; surface "no baseline" instead.
    if (previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

const AUTH_QUERY_STALE_TIME_MS = 5 * 60_000;
const ANALYTICS_QUERY_STALE_TIME_MS = 60_000;
const ANALYTICS_CURRENCIES: readonly ApiMoneyCurrency[] = ['UZS', 'USD'];

export default function AnalyticsPage() {
    const { t, locale } = useI18n();
    const [range, setRange] = useState<AnalyticsRange>(DEFAULT_ANALYTICS_RANGE);
    const [currency, setCurrency] = useState<ApiMoneyCurrency>('UZS');

    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: AUTH_QUERY_STALE_TIME_MS,
    });
    const currentUser = currentUserQuery.data;
    const canViewPayments = canView(currentUser, 'payments');
    const canViewPatients = canView(currentUser, 'patients');
    const canViewAppointments = canView(currentUser, 'appointments');
    const canViewVisits = canViewAppointments || canViewPayments;

    // `now` re-evaluates on every range change so a long-lived tab that
    // spans midnight still anchors the window correctly. We deliberately
    // skip a per-render refresh — it would invalidate every useMemo each
    // render, which is more expensive than a stale "now" for the seconds
    // it takes the user to interact.
    const rangeAnchor = useMemo(() => ({ range, now: new Date() }), [range]);
    const now = rangeAnchor.now;
    const bounds = useMemo(() => getRangeBounds(range, now), [range, now]);
    const previousBounds = useMemo(() => getPreviousRangeBounds(range, now), [range, now]);
    const analyticsSummaryParams = useMemo(
        () => ({
            range,
            current_from: formatApiDate(bounds.start),
            current_to: formatApiDate(bounds.end),
            previous_from: formatApiDate(previousBounds.start),
            previous_to: formatApiDate(previousBounds.end),
            currency,
        }),
        [range, bounds.start, bounds.end, previousBounds.start, previousBounds.end, currency]
    );

    const analyticsQuery = useQuery({
        queryKey: [
            'analytics',
            'summary',
            analyticsSummaryParams.range,
            analyticsSummaryParams.current_from,
            analyticsSummaryParams.current_to,
            analyticsSummaryParams.previous_from,
            analyticsSummaryParams.previous_to,
            analyticsSummaryParams.currency,
        ],
        queryFn: () => getAnalyticsSummary(analyticsSummaryParams),
        enabled: canViewPayments || canViewPatients || canViewAppointments,
        placeholderData: (previousData) => previousData?.currency === currency ? previousData : undefined,
        staleTime: ANALYTICS_QUERY_STALE_TIME_MS,
    });

    const analytics = analyticsQuery.data;
    const resolvedCurrency = analytics?.currency ?? currency;

    const displayLocale = getActiveDisplayLocale();
    const buckets = useMemo(
        () => buildChartBuckets(range, bounds, displayLocale),
        [range, bounds, displayLocale]
    );

    // KPI #1 — Revenue collected within the selected range. Sum
    // `paid_amount` on treatments whose treatment_date is in the window.
    const revenueKpi = useMemo(() => {
        const current = analytics?.kpis.revenue.current ?? 0;
        const previous = analytics?.kpis.revenue.previous ?? 0;
        return { current, previous, delta: computeDelta(current, previous) };
    }, [analytics]);

    // KPI #2 — Outstanding debt across all patients (snapshot value).
    // It's a standing balance, not a flow, so we don't compute a baseline
    // delta — the KpiCard renders the "no previous data" hint.
    const debtKpi = useMemo(() => {
        return {
            current: analytics?.kpis.debt.current ?? 0,
            delta: null as number | null,
        };
    }, [analytics]);

    // KPI #3 — New patients registered in the range.
    const patientsKpi = useMemo(() => {
        const current = analytics?.kpis.patients.current ?? 0;
        const previous = analytics?.kpis.patients.previous ?? 0;
        return { current, previous, delta: computeDelta(current, previous) };
    }, [analytics]);

    // KPI #4: real visits, not just appointment rows. A completed
    // appointment and a treatment/history entry on the same patient/day
    // represent one clinical visit.
    const visitsKpi = useMemo(() => {
        const current = analytics?.kpis.visits.current ?? 0;
        const previous = analytics?.kpis.visits.previous ?? 0;

        return {
            current,
            previous,
            delta: computeDelta(current, previous),
        };
    }, [analytics]);

    const revenueByBucket = useMemo(() => {
        const summaryByKey = new Map((analytics?.buckets ?? []).map((bucket) => [bucket.key, bucket]));
        return buckets.map((bucket) => {
            const row = summaryByKey.get(bucket.key);
            const revenue = row?.revenue ?? 0;
            const debt = row?.debt ?? 0;
            return { month: bucket.label, revenue, debt };
        });
    }, [analytics, buckets]);

    const patientGrowth = useMemo(() => {
        const summaryByKey = new Map((analytics?.buckets ?? []).map((bucket) => [bucket.key, bucket]));
        return buckets.map((bucket) => {
            const row = summaryByKey.get(bucket.key);
            return {
                month: bucket.label,
                total: row?.cumulative_patients ?? 0,
                new: row?.new_patients ?? 0,
            };
        });
    }, [analytics, buckets]);

    const appointmentStatus = useMemo(() => analytics?.appointment_status ?? [], [analytics]);

    const topDebtors = useMemo(() => analytics?.top_debtors ?? [], [analytics]);
    const handleExport = useCallback(() => {
        const rangeLabel = t(`analytics.range.${range}`);
        const today = formatLocalizedDate(new Date().toISOString(), locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
        try {
            exportRowsToPdf({
                filename: buildPdfFilename(`${t('analytics.export.filename')}-${range}`),
                title: t('analytics.export.title'),
                subtitle: `${t('analytics.export.range', { range: rangeLabel })} • ${t('analytics.export.generated', { date: today })}`,
                locale,
                orientation: 'portrait',
                columns: [
                    t('analytics.export.col.month'),
                    t('analytics.export.col.revenue'),
                    t('analytics.export.col.debt'),
                ],
                rows: revenueByBucket.map((row) => [
                    row.month,
                    formatCurrency(row.revenue, resolvedCurrency),
                    formatCurrency(row.debt, resolvedCurrency),
                ]),
                summary: [
                    { label: t('analytics.kpi.revenue'), value: formatCurrency(revenueKpi.current, resolvedCurrency) },
                    { label: t('analytics.kpi.debt'), value: formatCurrency(debtKpi.current, resolvedCurrency) },
                    { label: t('analytics.kpi.patients'), value: String(patientsKpi.current) },
                    {
                        label: t('analytics.kpi.visits'),
                        value: String(visitsKpi.current),
                    },
                ],
            });
        }
        catch (error) {
            toast.error(getApiErrorMessage(error, t('analytics.export.error')));
        }
    }, [
        t,
        locale,
        range,
        revenueByBucket,
        revenueKpi,
        debtKpi,
        patientsKpi,
        visitsKpi,
        resolvedCurrency,
    ]);

    if (currentUserQuery.isLoading) {
        return <AnalyticsLoadingState />;
    }

    // Check the session error BEFORE the permission gate: when the auth/me
    // query fails, `currentUser` is undefined so every canView() is false,
    // which would otherwise dead-end the user into a non-retryable
    // "access denied" screen instead of a retryable load error.
    if (currentUserQuery.isError) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(currentUserQuery.error, t('common.loadErrorTitle'))}
                retryLabel={t('common.retry')}
                onRetry={() => currentUserQuery.refetch()}
            />
        );
    }

    if (!canViewPayments && !canViewPatients && !canViewAppointments) {
        return <AccessDeniedState title={t('common.forbiddenTitle')} description={t('permissions.deniedDescription')} />;
    }

    // Keep the loading skeleton in the same permission-shaped layout as the
    // final page to avoid large jumps for assistant accounts.
    const visibleKpiCount =
        (canViewPayments ? 2 : 0) + (canViewPatients ? 1 : 0) + (canViewVisits ? 1 : 0);
    const showRevenueChart = canViewPayments;
    const showStatusChart = canViewAppointments;
    const showGrowthChart = canViewPatients;
    const showDebtorsCard = canViewPayments;

    if (analyticsQuery.isLoading) {
        return (
            <AnalyticsLoadingState
                visibleKpiCount={visibleKpiCount}
                showRevenueChart={showRevenueChart}
                showStatusChart={showStatusChart}
                showGrowthChart={showGrowthChart}
                showDebtorsCard={showDebtorsCard}
            />
        );
    }

    if (analyticsQuery.isError) {
        return (
            <AppErrorState
                title={t('analytics.title')}
                description={getApiErrorMessage(analyticsQuery.error, t('common.loadErrorTitle'))}
                retryLabel={t('common.retry')}
                onRetry={() => analyticsQuery.refetch()}
            />
        );
    }

    // Permission-aware layout: when an assistant lacks `payments.view`, the
    // 4-column KPI grid would otherwise leave two empty slots, and the
    // 3-col/2-col chart rows would leave a single chart sitting in a
    // fraction of the row width. Count the visible cells in each row and
    // pick a grid template that fills cleanly for any permission shape.
    const kpiGridClass =
        visibleKpiCount <= 1
            ? 'grid grid-cols-1 gap-4'
            : visibleKpiCount === 2
                ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
                : visibleKpiCount === 3
                    ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
                    : 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4';

    const firstChartRowBoth = showRevenueChart && showStatusChart;
    const firstChartRowClass = firstChartRowBoth
        ? 'grid grid-cols-1 gap-2.5 lg:grid-cols-3'
        : 'grid grid-cols-1 gap-2.5';

    const secondChartRowBoth = showGrowthChart && showDebtorsCard;
    const secondChartRowClass = secondChartRowBoth
        ? 'grid grid-cols-1 gap-2.5 lg:grid-cols-2'
        : 'grid grid-cols-1 gap-2.5';

    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeader
                title={t('analytics.title')}
                description={t('analytics.subtitle')}
                actions={
                    canViewPayments ? (
                        <Button
                            variant="outline"
                            onClick={handleExport}
                            className="h-9 gap-2 rounded-xl bg-white px-3.5"
                        >
                            <Download className="h-4 w-4" aria-hidden="true" />
                            {t('analytics.export')}
                        </Button>
                    ) : null
                }
            />

            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <TimeRangeSelector value={range} onChange={setRange} />
                {canViewPayments ? (
                    <div
                        role="group"
                        aria-label={t('payments.expenses.currency')}
                        className="inline-flex h-10 w-fit items-center rounded-full border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/50"
                    >
                        {ANALYTICS_CURRENCIES.map((option) => (
                            <button
                                key={option}
                                type="button"
                                aria-pressed={currency === option}
                                onClick={() => setCurrency(option)}
                                className={cn(
                                    'inline-flex h-8 min-w-14 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1',
                                    currency === option
                                        ? 'border-teal-300 bg-teal-50 text-teal-700 shadow-sm shadow-teal-100/60'
                                        : 'border-transparent bg-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                )}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                ) : null}
            </div>

            <div className={kpiGridClass}>
                {canViewPayments ? (
                    <KpiCard
                        label={t('analytics.kpi.revenue')}
                        description={t('analytics.kpi.revenue.descr')}
                        value={formatCurrency(revenueKpi.current, resolvedCurrency)}
                        deltaPercent={revenueKpi.delta}
                        tone="positive"
                        icon={Wallet}
                        accent="teal"
                    />
                ) : null}
                {canViewPayments ? (
                    <KpiCard
                        label={t('analytics.kpi.debt')}
                        description={t('analytics.kpi.debt.descr')}
                        value={formatCurrency(debtKpi.current, resolvedCurrency)}
                        deltaPercent={debtKpi.delta}
                        tone="negative"
                        icon={Banknote}
                        accent="rose"
                    />
                ) : null}
                {canViewPatients ? (
                    <KpiCard
                        label={t('analytics.kpi.patients')}
                        description={t('analytics.kpi.patients.descr')}
                        value={String(patientsKpi.current)}
                        deltaPercent={patientsKpi.delta}
                        tone="positive"
                        icon={Users}
                        accent="blue"
                    />
                ) : null}
                {canViewVisits ? (
                    <KpiCard
                        label={t('analytics.kpi.visits')}
                        description={t('analytics.kpi.visits.descr')}
                        value={String(visitsKpi.current)}
                        deltaPercent={visitsKpi.delta}
                        tone="positive"
                        icon={CheckCircle2}
                        accent="emerald"
                    />
                ) : null}
            </div>

            {showRevenueChart || showStatusChart ? (
                <div className={firstChartRowClass}>
                    {showRevenueChart ? (
                        <div className={firstChartRowBoth ? 'lg:col-span-2' : undefined}>
                            <RevenueChart
                                data={revenueByBucket}
                                rangeLabel={t(`analytics.range.${range}`)}
                                currency={resolvedCurrency}
                            />
                        </div>
                    ) : null}
                    {showStatusChart ? (
                        <AppointmentStatusChart data={appointmentStatus} />
                    ) : null}
                </div>
            ) : null}

            {showGrowthChart || showDebtorsCard ? (
                <div className={secondChartRowClass}>
                    {showGrowthChart ? <PatientGrowthChart data={patientGrowth} rangeLabel={t(`analytics.range.${range}`)} /> : null}
                    {showDebtorsCard ? <TopDebtorsCard data={topDebtors} currency={resolvedCurrency} /> : null}
                </div>
            ) : null}
        </div>
    );
}
