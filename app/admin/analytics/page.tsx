'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Download, TrendingUp, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';

import { AdminHeader } from '@/components/admin/admin-header';
import { AppErrorState } from '@/components/error/app-error-state';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-shell';
import { useI18n } from '@/components/providers/i18n-provider';
import { useInstantLogout } from '@/lib/auth/use-instant-logout';
import { getApiErrorMessage } from '@/lib/api/client';
import {
    getCurrentUser,
    getAdminAnalyticsSummary,
} from '@/lib/api/dentist';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { formatCurrency } from '@/lib/utils';
import { KpiCard } from '@/components/analytics/kpi-card';
import {
    type AnalyticsRange,
    DEFAULT_ANALYTICS_RANGE,
    getPreviousRangeBounds,
    getRangeBounds,
    TimeRangeSelector,
} from '@/components/analytics/time-range-selector';
import {
    SignupGrowthChart,
    SubscriptionHealthChart,
    type SubscriptionHealthStatus,
} from '@/components/analytics/admin-charts';
import { AdminAnalyticsLoadingState } from '@/components/layout/page-loading-skeletons';
import { buildChartBuckets } from '@/lib/analytics/chart-buckets';
import { getActiveDisplayLocale } from '@/lib/i18n/date';
import { buildPdfFilename, exportRowsToPdf } from '@/lib/export/pdf';
import { queryKeys } from '@/lib/query-keys';

function formatApiDate(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function computeDelta(current: number, previous: number): number | null {
    // (0, 0) used to return 0, rendering as a neutral "0%" pill that reads
    // as "no change". When both sides truly have no data, render "no
    // baseline" instead.
    if (previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

const ADMIN_AUTH_QUERY_STALE_TIME_MS = 5 * 60_000;
const ADMIN_ANALYTICS_QUERY_STALE_TIME_MS = 60_000;
export default function AdminAnalyticsPage() {
    const router = useRouter();
    const { t, locale } = useI18n();
    const handleLogout = useInstantLogout('/admin/login');
    const [range, setRange] = useState<AnalyticsRange>(DEFAULT_ANALYTICS_RANGE);

    const authQuery = useQuery({
        queryKey: queryKeys.auth.me(),
        queryFn: getCurrentUser,
        retry: false,
        staleTime: ADMIN_AUTH_QUERY_STALE_TIME_MS,
    });

    useEffect(() => {
        if (authQuery.isError && !authQuery.isLoading) {
            router.replace('/admin/login');
            return;
        }
        if (authQuery.data && authQuery.data.role !== 'admin') {
            router.replace('/');
        }
    }, [authQuery.isError, authQuery.isLoading, authQuery.data, router]);

    const isAdmin = authQuery.data?.role === 'admin';

    const displayLocale = getActiveDisplayLocale();
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
        }),
        [range, bounds.start, bounds.end, previousBounds.start, previousBounds.end]
    );

    const summaryQuery = useQuery({
        queryKey: queryKeys.admin.analytics(analyticsSummaryParams),
        queryFn: () => getAdminAnalyticsSummary(analyticsSummaryParams),
        enabled: isAdmin,
        placeholderData: (previousData) => previousData,
        staleTime: ADMIN_ANALYTICS_QUERY_STALE_TIME_MS,
    });

    const analytics = summaryQuery.data;
    const buckets = useMemo(
        () => buildChartBuckets(range, bounds, displayLocale),
        [range, bounds, displayLocale]
    );

    const activeKpi = useMemo(() => {
        const current = analytics?.kpis.active_dentists.current ?? 0;
        const previous = analytics?.kpis.active_dentists.previous ?? 0;
        return { current, previous, delta: computeDelta(current, previous) };
    }, [analytics]);

    const mrr = analytics?.kpis.mrr;
    const mrrRows = mrr?.totals_by_currency ?? [{
        current: mrr?.current ?? 0,
        currency: mrr?.currency ?? 'UZS',
    }];
    const mrrValue = mrrRows
        .map((row) => formatCurrency(row.current, row.currency))
        .join(' / ');

    const signupsKpi = useMemo(() => {
        const current = analytics?.kpis.signups.current ?? 0;
        const previous = analytics?.kpis.signups.previous ?? 0;
        return { current, previous, delta: computeDelta(current, previous) };
    }, [analytics]);

    const conversionKpi = useMemo(() => {
        const current = analytics?.kpis.conversion.current ?? 0;
        const previous = analytics?.kpis.conversion.previous ?? 0;
        return { current, previous, delta: computeDelta(current, previous) };
    }, [analytics]);

    const signupGrowth = useMemo(() => {
        const summaryByKey = new Map((analytics?.signup_growth ?? []).map((row) => [row.key, row]));
        return buckets.map((bucket) => {
            const row = summaryByKey.get(bucket.key);
            return {
                month: bucket.label,
                signups: row?.signups ?? 0,
                cumulative: row?.cumulative ?? 0,
            };
        });
    }, [analytics, buckets]);

    const subscriptionHealth = useMemo(() => {
        const rows = analytics?.subscription_health ?? [];
        return rows.map((row) => ({
            status: row.status as SubscriptionHealthStatus,
            count: row.count,
        }));
    }, [analytics]);
    const handleExport = useCallback(() => {
        const rangeLabel = t(`analytics.range.${range}`);
        const today = formatLocalizedDate(new Date().toISOString(), locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
        try {
            exportRowsToPdf({
                filename: buildPdfFilename(`admin-analytics-${range}`),
                title: t('admin.analytics.export.title'),
                subtitle: `${t('analytics.export.range', { range: rangeLabel })} • ${t('analytics.export.generated', { date: today })}`,
                locale,
                orientation: 'portrait',
                columns: [
                    t('admin.analytics.export.col.month'),
                    t('admin.analytics.export.col.signups'),
                    t('admin.analytics.export.col.activeAtEnd'),
                ],
                rows: signupGrowth.map((row) => [
                    row.month,
                    String(row.signups),
                    String(row.cumulative),
                ]),
                summary: [
                    {
                        label: t('admin.analytics.kpi.activeDentists'),
                        value: String(activeKpi.current),
                    },
                    {
                        label: t('admin.analytics.kpi.mrr'),
                        value: mrrValue,
                    },
                    {
                        label: t('admin.analytics.kpi.signups'),
                        value: String(signupsKpi.current),
                    },
                    {
                        label: t('admin.analytics.kpi.conversion'),
                        value: `${Math.round(conversionKpi.current)}%`,
                    },
                ],
            });
        }
        catch (error) {
            toast.error(getApiErrorMessage(error, t('admin.analytics.export.error')));
        }
    }, [
        t,
        locale,
        range,
        signupGrowth,
        activeKpi,
        mrrValue,
        signupsKpi,
        conversionKpi,
    ]);

    if (authQuery.isLoading || !authQuery.data) {
        return <AdminAnalyticsLoadingState />;
    }

    if (authQuery.data.role !== 'admin') {
        return null;
    }

    if (authQuery.isError) {
        return (
            <AppErrorState
                title={t('admin.analyticsTitle')}
                description={getApiErrorMessage(authQuery.error, '')}
                onRetry={() => authQuery.refetch()}
            />
        );
    }

    if (summaryQuery.isLoading) {
        return <AdminAnalyticsLoadingState />;
    }

    if (summaryQuery.isError) {
        return (
            <AppErrorState
                title={t('admin.analyticsTitle')}
                description={getApiErrorMessage(summaryQuery.error, t('common.loadErrorTitle'))}
                onRetry={() => summaryQuery.refetch()}
            />
        );
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader active="analytics" onLogout={handleLogout} />

            <main className="mx-auto max-w-[1440px] space-y-5 px-3 py-6 sm:px-6 sm:py-8 lg:space-y-6 lg:px-8">
                <PageHeader
                    title={t('admin.analyticsTitle')}
                    description={t('admin.analyticsSubtitle')}
                    actions={
                        <Button
                            variant="outline"
                            onClick={handleExport}
                            className="h-9 gap-2 rounded-xl bg-white px-3.5"
                        >
                            <Download className="h-4 w-4" aria-hidden="true" />
                            {t('admin.analytics.export')}
                        </Button>
                    }
                />

                <TimeRangeSelector value={range} onChange={setRange} />

                {/* KPI hero — 4 cards. Active dentists & MRR are point-in-
                    time snapshots; sign-ups & conversion are range-scoped. */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard
                        label={t('admin.analytics.kpi.activeDentists')}
                        description={t('admin.analytics.kpi.activeDentists.descr')}
                        value={String(activeKpi.current)}
                        deltaPercent={activeKpi.delta}
                        tone="positive"
                        icon={Users}
                        accent="teal"
                    />
                    <KpiCard
                        label={t('admin.analytics.kpi.mrr')}
                        description={t('admin.analytics.kpi.mrr.descr')}
                        value={mrrValue}
                        deltaPercent={null}
                        tone="positive"
                        icon={TrendingUp}
                        accent="emerald"
                    />
                    <KpiCard
                        label={t('admin.analytics.kpi.signups')}
                        description={t('admin.analytics.kpi.signups.descr')}
                        value={String(signupsKpi.current)}
                        deltaPercent={signupsKpi.delta}
                        tone="positive"
                        icon={UserPlus}
                        accent="blue"
                    />
                    <KpiCard
                        label={t('admin.analytics.kpi.conversion')}
                        description={t('admin.analytics.kpi.conversion.descr')}
                        value={`${Math.round(conversionKpi.current)}%`}
                        deltaPercent={conversionKpi.delta}
                        tone="positive"
                        icon={BadgeCheck}
                        accent="amber"
                    />
                </div>

                {/* Chart row — subscription health donut + signup growth
                    line. Signup growth is the bigger / more story-telling
                    chart so it takes 2 of 3 columns on lg+. The plan-mix
                    donut was removed because plan distribution is already
                    available on the /admin/plans page and added little
                    actionable signal on this dashboard — subscription
                    health (which surfaces grace / read_only buckets that
                    need admin action) is the more useful donut here. */}
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
                    <SubscriptionHealthChart data={subscriptionHealth} />
                    <div className="lg:col-span-2">
                        <SignupGrowthChart data={signupGrowth} />
                    </div>
                </div>
            </main>
        </div>
    );
}
