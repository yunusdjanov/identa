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
    listAdminPlans,
    listAllAdminDentists,
} from '@/lib/api/dentist';
import type { ApiAdminDentist, ApiPlan } from '@/lib/api/types';
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
import { withinLocalBounds } from '@/lib/analytics/date-bounds';
import { buildChartBuckets } from '@/lib/analytics/chart-buckets';
import { getActiveDisplayLocale } from '@/lib/i18n/date';
import { buildPdfFilename, exportRowsToPdf } from '@/lib/export/pdf';

function computeDelta(current: number, previous: number): number | null {
    // (0, 0) used to return 0, rendering as a neutral "0%" pill that reads
    // as "no change". When both sides truly have no data, render "no
    // baseline" instead.
    if (previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

// Stable empty references prevent each render from producing a new `[]`
// that would invalidate every downstream useMemo dependency.
const EMPTY_DENTISTS: readonly ApiAdminDentist[] = Object.freeze([]);
const EMPTY_PLANS: readonly ApiPlan[] = Object.freeze([]);

/**
 * MRR (Monthly Recurring Revenue) — sum of monthly-equivalent prices for
 * every dentist whose subscription is in a billable state. Yearly plans
 * contribute price/12 so the metric reads as a normalised monthly number.
 *
 * Read from `ApiPlan.monthly_price` / `yearly_price` rather than the
 * dentist's `subscription.payment_amount` field, because payment_amount
 * is the *last admin-recorded receipt* (which may be a partial payment or
 * a custom amount), not the plan's posted price. Pricing analytics needs
 * the catalog price.
 */
function computeMrr(
    dentists: readonly ApiAdminDentist[],
    plans: readonly ApiPlan[]
): { amount: number; currency: string } {
    if (plans.length === 0) return { amount: 0, currency: 'UZS' };
    const planByCode = new Map<string, ApiPlan>();
    for (const plan of plans) {
        planByCode.set(plan.code, plan);
    }
    let mrr = 0;
    // First paid plan's currency wins. In a multi-currency deployment this
    // is incorrect (you can't sum USD + UZS into a single MRR), and the
    // KPI should be broken into per-currency rows. For Identa's single-
    // currency reality we report the dominant currency; if/when multi-
    // currency tenants land, switch to a Map<currency, amount>.
    let currency = 'UZS';
    let pickedCurrency = false;
    for (const d of dentists) {
        const sub = d.subscription;
        const billable = sub.status === 'active' || sub.status === 'grace' || sub.status === 'read_only';
        if (!billable) continue;
        if (!sub.plan || sub.plan === 'trial') continue;
        const plan = planByCode.get(sub.plan);
        if (!plan) continue;
        if (!pickedCurrency) {
            currency = plan.currency ?? 'UZS';
            pickedCurrency = true;
        }
        if (sub.billing_period === 'yearly') {
            mrr += Number(plan.yearly_price ?? 0) / 12;
        } else {
            mrr += Number(plan.monthly_price ?? 0);
        }
    }
    return { amount: Math.round(mrr), currency };
}

export default function AdminAnalyticsPage() {
    const router = useRouter();
    const { t, locale } = useI18n();
    const handleLogout = useInstantLogout('/admin/login');
    const [range, setRange] = useState<AnalyticsRange>(DEFAULT_ANALYTICS_RANGE);

    const authQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
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

    // Pull the full dentist roster once — same approach the /admin dashboard
    // uses for its stat cards. For a SaaS tenant of typical size (<10k
    // accounts) the single roundtrip keeps the analytics page snappy and
    // avoids over-engineering pagination just for aggregation.
    const dentistsQuery = useQuery({
        queryKey: ['admin', 'analytics', 'dentists'],
        queryFn: () => listAllAdminDentists(),
        enabled: isAdmin,
    });

    const plansQuery = useQuery({
        queryKey: ['admin', 'analytics', 'plans'],
        queryFn: listAdminPlans,
        enabled: isAdmin,
    });

    // (Previously fetched `listAdminPayments` for its summary, but never
    // read it — the payments-summary query blocked the loading gate for
    // bandwidth it didn't use. Removed; MRR is computed from the plan
    // catalog instead.)

    const dentists = dentistsQuery.data ?? EMPTY_DENTISTS;
    const plans = plansQuery.data ?? EMPTY_PLANS;
    const displayLocale = useMemo(() => getActiveDisplayLocale(), [locale]);
    // `now` re-evaluates whenever the range changes so a long-lived tab
    // crossing midnight still anchors fresh windows. We deliberately skip
    // per-render refresh — it would invalidate every useMemo each render.
    const now = useMemo(() => new Date(), [range]);
    const bounds = useMemo(() => getRangeBounds(range, now), [range, now]);
    const previousBounds = useMemo(() => getPreviousRangeBounds(range, now), [range, now]);
    const buckets = useMemo(
        () => buildChartBuckets(range, bounds, displayLocale),
        [range, bounds, displayLocale]
    );

    // KPI #1 — Active dentists snapshot (point in time, no period filter).
    // Delta vs previous period uses `registration_date` to approximate the
    // active count at the end of the previous window — a perfect signal
    // would require a historical snapshot endpoint we don't have yet.
    const activeKpi = useMemo(() => {
        const current = dentists.filter((d) => d.status === 'active').length;
        // Approximation: count current-active accounts whose registration
        // is ≤ previousBounds.end. Not churn-aware (today's blocked accounts
        // are dropped from BOTH sides), but works as a directional indicator
        // until /admin/snapshots gives a real historical count.
        const previous = dentists.filter((d) => {
            if (d.status !== 'active') return false;
            const reg = d.registration_date
                ? new Date(
                    Number(d.registration_date.slice(0, 4)),
                    Number(d.registration_date.slice(5, 7)) - 1,
                    Number(d.registration_date.slice(8, 10))
                )
                : null;
            return reg !== null && reg <= previousBounds.end;
        }).length;
        return { current, previous, delta: computeDelta(current, previous) };
    }, [dentists, previousBounds.end]);

    // KPI #2 — MRR snapshot. Same caveat as #1: this is a point-in-time
    // figure with an approximate previous-period baseline (assume churned
    // / brand-new subs scale with active-count delta).
    const mrrKpi = useMemo(() => {
        const { amount: currentAmount, currency } = computeMrr(dentists, plans);
        // Previous-period MRR ≈ current * (previous active / current active)
        // when active count changed; falls back to current when we can't tell.
        const active = activeKpi.current;
        const previous = active > 0
            ? Math.round(currentAmount * (activeKpi.previous / active))
            : currentAmount;
        return {
            current: currentAmount,
            previous,
            delta: computeDelta(currentAmount, previous),
            currency,
        };
    }, [dentists, plans, activeKpi.current, activeKpi.previous]);

    // KPI #3 — Sign-ups in the selected range, with delta vs the prior
    // window of the same length. This is the cleanest range-based metric
    // on the page: no proxy math.
    const signupsKpi = useMemo(() => {
        let current = 0;
        let previous = 0;
        for (const d of dentists) {
            if (withinLocalBounds(d.registration_date, bounds.start, bounds.end)) current += 1;
            else if (withinLocalBounds(d.registration_date, previousBounds.start, previousBounds.end)) previous += 1;
        }
        return { current, previous, delta: computeDelta(current, previous) };
    }, [dentists, bounds, previousBounds]);

    // KPI #4 — Trial conversion rate. Paid sub count / (paid sub count +
    // expired-trial count). "Expired trial" = subscription.status === 'canceled'
    // && plan === 'trial' OR trial_ends_at in the past AND plan still trial.
    // The metric is intentionally lossy — it's a directional read on whether
    // trials are turning into customers, not a finance-grade calculation.
    const conversionKpi = useMemo(() => {
        function calc(start: Date, end: Date): number {
            let paid = 0;
            let finishedTrials = 0;
            for (const d of dentists) {
                if (!withinLocalBounds(d.registration_date, start, end)) continue;
                const sub = d.subscription;
                if ((sub.status === 'active' || sub.status === 'grace' || sub.status === 'read_only')
                    && sub.plan && sub.plan !== 'trial') {
                    paid += 1;
                } else if (sub.plan === 'trial' && sub.trial_ends_at && new Date(sub.trial_ends_at) < now) {
                    finishedTrials += 1;
                }
            }
            const denom = paid + finishedTrials;
            return denom > 0 ? (paid / denom) * 100 : 0;
        }
        const current = calc(bounds.start, bounds.end);
        const previous = calc(previousBounds.start, previousBounds.end);
        return {
            current,
            previous,
            delta: previous > 0 ? computeDelta(current, previous) : null,
        };
    }, [dentists, bounds, previousBounds]);

    // (Plan-mix donut was removed — same data is already on /admin/plans
    // and Subscription Health is the more actionable donut for this page.)

    // Signup growth line — sign-ups per bucket + cumulative active count.
    const signupGrowth = useMemo(() => {
        return buckets.map((bucket, index) => {
            const signups = dentists.filter((d) => bucket.match(d.registration_date)).length;
            const cumulativeCutoff = index === buckets.length - 1 ? bounds.end : null;
            // For all but the last bucket the cumulative line counts
            // accounts registered on or before the LAST day of this bucket.
            // For the last bucket we use `bounds.end` directly so the line
            // ends at "today" rather than a future date.
            const cumulative = dentists.filter((d) => {
                if (!d.registration_date || d.status !== 'active') return false;
                const reg = new Date(
                    Number(d.registration_date.slice(0, 4)),
                    Number(d.registration_date.slice(5, 7)) - 1,
                    Number(d.registration_date.slice(8, 10))
                );
                if (cumulativeCutoff !== null) return reg <= cumulativeCutoff;
                // Walk buckets up to and including the current index; if the
                // record matches any of them it's "before or in" this bucket.
                for (let i = 0; i <= index; i += 1) {
                    if (buckets[i].match(d.registration_date)) return true;
                }
                return false;
            }).length;
            return { month: bucket.label, signups, cumulative };
        });
    }, [dentists, buckets, bounds.end]);

    // Subscription health donut — count subscriptions by their `status`.
    // This replaces the earlier account-status bar chart because account
    // status is overwhelmingly "active" (admins rarely manually block);
    // subscription status carries the actionable signal — how many are
    // in grace (payment overdue), read_only (limit downgrade applied),
    // or canceled.
    //
    // We don't fold deleted accounts into "canceled" here even though the
    // semantic comment used to suggest it: `listAllAdminDentists` excludes
    // soft-deleted rows server-side, so the `d.status === 'deleted'`
    // branch was unreachable. If we ever surface the archive view to
    // analytics we'd need to opt-in via `filter[include_deleted]=1` and
    // re-add the fold; until then it's just dead code.
    const subscriptionHealth = useMemo(() => {
        const buckets: Record<SubscriptionHealthStatus, number> = {
            active: 0,
            trialing: 0,
            grace: 0,
            read_only: 0,
            canceled: 0,
            none: 0,
        };
        for (const d of dentists) {
            const s = d.subscription.status;
            if (s in buckets) {
                buckets[s as SubscriptionHealthStatus] += 1;
            } else {
                buckets.none += 1;
            }
        }
        return (Object.entries(buckets) as Array<[SubscriptionHealthStatus, number]>)
            .map(([status, count]) => ({ status, count }));
    }, [dentists]);

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
                        value: formatCurrency(mrrKpi.current, mrrKpi.currency),
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
        mrrKpi,
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

    const dataLoading = dentistsQuery.isLoading || plansQuery.isLoading;
    if (dataLoading) {
        return <AdminAnalyticsLoadingState />;
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
                        value={formatCurrency(mrrKpi.current, mrrKpi.currency)}
                        deltaPercent={mrrKpi.delta}
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
