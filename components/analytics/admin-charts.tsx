'use client';

import { useMemo } from 'react';
import {
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { Activity, Users } from 'lucide-react';
import { useI18n } from '@/components/providers/i18n-provider';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Admin analytics chart cards. They mirror the visual language of the
 * dentist-side `dashboard-charts.tsx` (rounded card, eyebrow + title, soft
 * tooltips) and expose two admin-specific shapes:
 *
 * - `SignupGrowthChart` — line chart (cumulative + per-month)
 * - `SubscriptionHealthChart` — donut keyed on subscription.status, which is
 *   a richer signal for an admin than account_status (most accounts stay
 *   "active"; the interesting variation lives in grace / read_only / canceled).
 *
 * `PlanMixChart` used to live here too but plan distribution is already on
 * `/admin/plans` and subscription health turned out to be the more
 * actionable donut for this page. The component was removed when the
 * layout consolidated.
 */

/**
 * Subscription-status palette. Picked to read at a glance:
 * - active: emerald (healthy revenue)
 * - trialing: blue (potential revenue)
 * - grace: amber (at risk — payment overdue but still accessible)
 * - read_only: rose (degraded — admin should act)
 * - canceled: slate (churned)
 * - none: stone (not yet billable)
 */
const SUB_STATUS_COLOR: Record<string, string> = {
    active: '#10b981',
    trialing: '#3b82f6',
    grace: '#f59e0b',
    read_only: '#f43f5e',
    canceled: '#94a3b8',
    none: '#cbd5e1',
};

function ChartCard({
    title,
    subtitle,
    children,
}: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {subtitle}
                </p>
                <h3 className="text-sm font-bold tracking-tight text-slate-900">{title}</h3>
            </div>
            <div className="p-4">{children}</div>
        </div>
    );
}

/**
 * Centered total label for donut charts. Recharts doesn't expose an out-of-
 * the-box "center label" — we overlay an absolutely positioned element on
 * top of the SVG. The chart wrapper must be `relative`.
 */
function DonutCenterLabel({ total, caption }: { total: number; caption: string }) {
    return (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums text-slate-900">{total}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {caption}
            </span>
        </div>
    );
}

export interface SignupGrowthPoint {
    month: string;
    signups: number;
    cumulative: number;
}

export function SignupGrowthChart({ data }: { data: SignupGrowthPoint[] }) {
    const { t } = useI18n();
    const hasAny = useMemo(() => data.some((p) => p.signups > 0 || p.cumulative > 0), [data]);
    return (
        <ChartCard
            title={t('admin.analytics.charts.signupGrowth')}
            subtitle={t('admin.analytics.charts.signupGrowth.subtitle')}
        >
            {!hasAny ? (
                <EmptyState
                    icon={Users}
                    title={t('admin.analytics.charts.empty')}
                    size="sm"
                />
            ) : (
                <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                            dataKey="month"
                            stroke="#94a3b8"
                            tick={{ fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            stroke="#94a3b8"
                            tick={{ fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                        />
                        <Tooltip
                            contentStyle={{
                                borderRadius: 12,
                                border: '1px solid #e2e8f0',
                                fontSize: 12,
                            }}
                        />
                        <Line
                            type="monotone"
                            dataKey="cumulative"
                            stroke="#0d9488"
                            strokeWidth={2.5}
                            dot={{ fill: '#0d9488', r: 4 }}
                            activeDot={{ r: 6 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="signups"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={{ fill: '#3b82f6', r: 3 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            )}
        </ChartCard>
    );
}

/**
 * Status keys mirror `ApiSubscriptionSummary.status`. We keep all six in
 * the chart input even when their count is zero so the legend is stable
 * across renders (no items appearing/disappearing on data refresh).
 */
export type SubscriptionHealthStatus =
    | 'active'
    | 'trialing'
    | 'grace'
    | 'read_only'
    | 'canceled'
    | 'none';

export interface SubscriptionHealthPoint {
    status: SubscriptionHealthStatus;
    count: number;
}

/**
 * Donut + legend showing how subscriptions are distributed across health
 * states. Replaces the earlier "Account statuses" horizontal bar — for an
 * admin the spread of *subscription* status (grace, read-only, etc.) is the
 * more actionable signal; account status is overwhelmingly "active".
 */
export function SubscriptionHealthChart({ data }: { data: SubscriptionHealthPoint[] }) {
    const { t } = useI18n();
    const total = data.reduce((sum, p) => sum + p.count, 0);
    // Hide zero buckets from the visual donut so they don't crowd the
    // tooltip / legend with noise. They stay in the legend list below so
    // admin can confirm a state is truly empty.
    const nonZero = data.filter((p) => p.count > 0);

    return (
        <ChartCard
            title={t('admin.analytics.charts.subHealth')}
            subtitle={t('admin.analytics.charts.subHealth.subtitle')}
        >
            {total === 0 ? (
                <EmptyState
                    icon={Activity}
                    title={t('admin.analytics.charts.empty')}
                    size="sm"
                />
            ) : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                    <div className="relative mx-auto sm:mx-0" style={{ width: 180, height: 180 }}>
                        <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                                <Pie
                                    data={nonZero}
                                    dataKey="count"
                                    nameKey="status"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={56}
                                    outerRadius={82}
                                    paddingAngle={3}
                                    strokeWidth={0}
                                >
                                    {nonZero.map((entry) => (
                                        <Cell
                                            key={entry.status}
                                            fill={SUB_STATUS_COLOR[entry.status] ?? '#cbd5e1'}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: 12,
                                        border: '1px solid #e2e8f0',
                                        fontSize: 12,
                                    }}
                                    formatter={(value, name) => [
                                        `${value}`,
                                        t(`admin.analytics.charts.subHealth.${String(name)}`),
                                    ]}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <DonutCenterLabel
                            total={total}
                            caption={t('admin.analytics.charts.subHealth.total')}
                        />
                    </div>
                    <div className="flex flex-1 flex-col gap-2.5">
                        {data.map((entry) => {
                            const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
                            const dim = entry.count === 0;
                            return (
                                <div
                                    key={entry.status}
                                    className={`flex items-center gap-2.5 ${dim ? 'opacity-50' : ''}`}
                                >
                                    <span
                                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                                        style={{
                                            background: SUB_STATUS_COLOR[entry.status] ?? '#cbd5e1',
                                        }}
                                    />
                                    <span className="flex-1 truncate text-xs text-slate-700">
                                        {t(`admin.analytics.charts.subHealth.${entry.status}`)}
                                    </span>
                                    <span className="text-xs font-bold tabular-nums text-slate-900">
                                        {entry.count}
                                    </span>
                                    <span className="w-9 text-right text-[10px] tabular-nums text-slate-400">
                                        {pct}%
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </ChartCard>
    );
}
