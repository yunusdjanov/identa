'use client';

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type {
    DashboardAppointmentStatusPoint,
    DashboardPatientGrowthPoint,
    DashboardRevenuePoint,
} from '@/lib/api/dentist';

export interface TopDebtorPoint {
    name: string;
    phone: string;
    debt: number;
}
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/components/providers/i18n-provider';

const TONE = {
    teal: '#14b8a6',
    tealLight: '#5eead4',
    blue: '#3b82f6',
    yellow: '#eab308',
    rose: '#f43f5e',
    slate: '#64748b',
    emerald: '#10b981',
} as const;

const STATUS_COLOR: Record<string, string> = {
    completed: TONE.teal,
    scheduled: TONE.blue,
    cancelled: TONE.slate,
    no_show: TONE.rose,
};

function formatShortCurrency(value: number): string {
    if (Math.abs(value) >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(value) >= 1_000) {
        return `${(value / 1_000).toFixed(0)}K`;
    }
    return String(value);
}

function ChartCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{subtitle ?? ''}</p>
                    <h3 className="text-sm font-bold tracking-tight text-slate-900">{title}</h3>
                </div>
                {action}
            </div>
            <div className="p-4">
                {children}
            </div>
        </div>
    );
}

export function RevenueChart({
    data,
    rangeLabel,
}: {
    data: DashboardRevenuePoint[];
    /**
     * Optional subtitle that overrides the hardcoded "6 months" default.
     * Pass the active range label (e.g. "7 days", "12 months") so the
     * chart honors the selector above it. Falls back to the legacy
     * `dashboard.revenueChart.subtitle` for the home-dashboard widget
     * which doesn't have a selector.
     */
    rangeLabel?: string;
}) {
    const { t } = useI18n();
    return (
        <ChartCard
            title={t('dashboard.revenueChart.title') ?? 'Daromad va qarz dinamikasi'}
            subtitle={rangeLabel ?? t('dashboard.revenueChart.subtitle') ?? '6 oy'}
        >
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={formatShortCurrency} />
                    <Tooltip
                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, padding: '8px 12px' }}
                        formatter={(value) => formatCurrency(Number(value))}
                        cursor={{ fill: '#f0fdfa', opacity: 0.5 }}
                    />
                    {/* Use the same vocabulary as the analytics KPI cards
                        (revenue / debt) so a viewer reading both the cards and
                        the chart legend doesn't see two different terms for
                        the same number. */}
                    <Bar dataKey="revenue" name={t('analytics.kpi.revenue') ?? 'Revenue'} fill={TONE.teal} radius={[6, 6, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="debt" name={t('analytics.kpi.debt') ?? 'Debt'} fill={TONE.yellow} radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
            </ResponsiveContainer>
        </ChartCard>
    );
}

export function AppointmentStatusChart({ data }: { data: DashboardAppointmentStatusPoint[] }) {
    const { t } = useI18n();
    const total = data.reduce((sum, p) => sum + p.count, 0);
    return (
        <ChartCard title={t('dashboard.statusChart.title') ?? "Qabullar holati"} subtitle={t('dashboard.statusChart.subtitle') ?? `Jami: ${total}`}>
            <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={180}>
                    <PieChart>
                        <Pie data={data} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={3} strokeWidth={0}>
                            {data.map((entry) => (
                                <Cell key={entry.status} fill={STATUS_COLOR[entry.status] ?? TONE.slate} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                            formatter={(value, name) => [`${value}`, t(`status.${name}`) ?? String(name)]}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-1 flex-col gap-2">
                    {data.map((entry) => {
                        const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
                        return (
                            <div key={entry.status} className="flex items-center gap-2">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[entry.status] ?? TONE.slate }} />
                                <span className="flex-1 truncate text-xs text-slate-600">{t(`status.${entry.status}`) ?? entry.status}</span>
                                <span className="text-xs font-bold tabular-nums text-slate-900">{entry.count}</span>
                                <span className="w-9 text-right text-[10px] tabular-nums text-slate-400">{pct}%</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </ChartCard>
    );
}

export function PatientGrowthChart({
    data,
    rangeLabel,
}: {
    data: DashboardPatientGrowthPoint[];
    /** Same role as `RevenueChart.rangeLabel` — override the legacy "6 oy". */
    rangeLabel?: string;
}) {
    const { t } = useI18n();
    return (
        <ChartCard
            title={t('dashboard.growthChart.title') ?? "Bemorlar bazasining o'sishi"}
            subtitle={rangeLabel ?? t('dashboard.growthChart.subtitle') ?? '6 oy'}
        >
            <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip
                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                        formatter={(value, name) => [value, name === 'total' ? (t('dashboard.totalPatients') ?? 'Total') : (t('dashboard.newPatients') ?? 'New')]}
                    />
                    <Line type="monotone" dataKey="total" stroke={TONE.teal} strokeWidth={2.5} dot={{ fill: TONE.teal, r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="new" stroke={TONE.blue} strokeWidth={2} strokeDasharray="4 4" dot={{ fill: TONE.blue, r: 3 }} />
                </LineChart>
            </ResponsiveContainer>
        </ChartCard>
    );
}

export function TopDebtorsCard({ data }: { data: TopDebtorPoint[] }) {
    const { t } = useI18n();
    const maxDebt = data.length > 0 ? Math.max(...data.map((d) => d.debt)) : 1;
    const totalDebt = data.reduce((sum, d) => sum + d.debt, 0);
    return (
        <ChartCard
            title={t('analytics.topDebtors.title') ?? "Eng katta qarzga ega bemorlar"}
            subtitle={data.length > 0 ? `${t('analytics.topDebtors.totalShort') ?? "Jami"}: ${formatCurrency(totalDebt)}` : (t('analytics.topDebtors.subtitle') ?? 'TOP 5')}
        >
            {data.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </span>
                    <p className="text-[13px] font-medium text-slate-600">{t('analytics.topDebtors.empty') ?? "Qarzga ega bemorlar yo'q"}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {data.map((item, idx) => {
                        const pct = (item.debt / maxDebt) * 100;
                        return (
                            <div key={`${item.name}-${idx}`} className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-red-50 text-[10px] font-bold text-red-700">
                                            {idx + 1}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-[13px] font-semibold text-slate-900">{item.name}</p>
                                            {item.phone ? (
                                                <p className="truncate text-[10px] tabular-nums text-slate-400">{item.phone}</p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <span className="shrink-0 text-[13px] font-bold tabular-nums text-red-700">{formatCurrency(item.debt)}</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                    <div className="h-full rounded-full bg-gradient-to-r from-red-400 to-red-600 transition-all" style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </ChartCard>
    );
}
