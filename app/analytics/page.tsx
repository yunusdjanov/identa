'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, CheckCircle2, Download, Users, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { getApiErrorMessage } from '@/lib/api/client';
import {
    getCurrentUser,
    getDashboardSnapshot,
    listAllAppointments,
    listAllTreatments,
    listPatients,
} from '@/lib/api/dentist';
import type {
    ApiAppointment,
    ApiPatient,
    ApiTreatment,
} from '@/lib/api/types';
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
import { extractPrimaryPhone, formatCurrency } from '@/lib/utils';
import { KpiCard } from '@/components/analytics/kpi-card';
import {
    type AnalyticsRange,
    DEFAULT_ANALYTICS_RANGE,
    getPreviousRangeBounds,
    getRangeBounds,
    TimeRangeSelector,
} from '@/components/analytics/time-range-selector';
import { withinLocalBounds } from '@/lib/analytics/date-bounds';
import { buildChartBuckets } from '@/lib/analytics/chart-buckets';
import { buildPdfFilename, exportRowsToPdf } from '@/lib/export/pdf';
import { formatLocalizedDate, getActiveDisplayLocale } from '@/lib/i18n/date';

function formatApiDate(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

/**
 * Outstanding balance for a treatment, clamped to ≥0. Mirrors the
 * backend's `balance = debt_amount − paid_amount` field but recomputes
 * locally so we don't depend on the field being present on every shape.
 */
function outstandingBalance(treatment: ApiTreatment): number {
    return Math.max(0, Number(treatment.debt_amount ?? 0) - Number(treatment.paid_amount ?? 0));
}

function computeDelta(current: number, previous: number): number | null {
    // (0, 0) used to return 0 — which renders as a literal "0%" with a neutral
    // arrow and reads as "no change". That's misleading when there's actually
    // no data on either side; surface "no baseline" instead.
    if (previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
}

// Stable empty references prevent each render from producing a new `[]`
// that would invalidate every downstream useMemo dependency.
const EMPTY_TREATMENTS: readonly ApiTreatment[] = Object.freeze([]);
const EMPTY_APPOINTMENTS: readonly ApiAppointment[] = Object.freeze([]);
const EMPTY_PATIENTS: readonly ApiPatient[] = Object.freeze([]);

export default function AnalyticsPage() {
    const { t, locale } = useI18n();
    const [range, setRange] = useState<AnalyticsRange>(DEFAULT_ANALYTICS_RANGE);

    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
    });
    const currentUser = currentUserQuery.data;
    const canViewPayments = canView(currentUser, 'payments');
    const canViewPatients = canView(currentUser, 'patients');
    const canViewAppointments = canView(currentUser, 'appointments');

    // `now` re-evaluates on every range change so a long-lived tab that
    // spans midnight still anchors the window correctly. We deliberately
    // skip a per-render refresh — it would invalidate every useMemo each
    // render, which is more expensive than a stale "now" for the seconds
    // it takes the user to interact.
    const now = useMemo(() => new Date(), [range]);
    const bounds = useMemo(() => getRangeBounds(range, now), [range, now]);
    const previousBounds = useMemo(() => getPreviousRangeBounds(range, now), [range, now]);
    const analyticsDateFilter = useMemo(
        () => ({
            date_from: formatApiDate(previousBounds.start),
            date_to: formatApiDate(bounds.end),
        }),
        [bounds.end, previousBounds.start]
    );

    const treatmentsQuery = useQuery({
        queryKey: ['analytics', 'treatments', analyticsDateFilter.date_from, analyticsDateFilter.date_to],
        queryFn: () => listAllTreatments({
            sort: '-treatment_date,-created_at',
            includeImages: false,
            filter: analyticsDateFilter,
        }),
        enabled: canViewPayments,
    });
    const patientsQuery = useQuery({
        queryKey: ['analytics', 'patients'],
        queryFn: () => listPatients({ page: 1, perPage: 500, sort: '-created_at' }),
        enabled: canViewPatients,
    });
    const appointmentsQuery = useQuery({
        queryKey: ['analytics', 'appointments', analyticsDateFilter.date_from, analyticsDateFilter.date_to],
        queryFn: () => listAllAppointments({ filter: analyticsDateFilter }),
        enabled: canViewAppointments,
    });
    const snapshotQuery = useQuery({
        queryKey: ['dashboard', 'snapshot'],
        queryFn: () => getDashboardSnapshot({ includeFinancials: true }),
        enabled: canViewPayments,
    });

    const treatments = treatmentsQuery.data ?? EMPTY_TREATMENTS;
    const patients = (patientsQuery.data?.data ?? EMPTY_PATIENTS) as readonly ApiPatient[];
    const appointments = appointmentsQuery.data ?? EMPTY_APPOINTMENTS;

    const displayLocale = useMemo(() => getActiveDisplayLocale(), [locale]);
    const buckets = useMemo(
        () => buildChartBuckets(range, bounds, displayLocale),
        [range, bounds, displayLocale]
    );

    // KPI #1 — Revenue collected within the selected range. Sum
    // `paid_amount` on treatments whose treatment_date is in the window.
    const revenueKpi = useMemo(() => {
        let current = 0;
        let previous = 0;
        for (const tr of treatments) {
            const paid = Number(tr.paid_amount ?? 0);
            if (!paid) continue;
            if (withinLocalBounds(tr.treatment_date, bounds.start, bounds.end)) {
                current += paid;
            } else if (withinLocalBounds(tr.treatment_date, previousBounds.start, previousBounds.end)) {
                previous += paid;
            }
        }
        return { current, previous, delta: computeDelta(current, previous) };
    }, [treatments, bounds, previousBounds]);

    // KPI #2 — Outstanding debt across all patients (snapshot value).
    // It's a standing balance, not a flow, so we don't compute a baseline
    // delta — the KpiCard renders the "no previous data" hint.
    const debtKpi = useMemo(() => {
        return {
            current: snapshotQuery.data?.outstandingDebtTotal ?? 0,
            delta: null as number | null,
        };
    }, [snapshotQuery.data]);

    // KPI #3 — New patients registered in the range.
    const patientsKpi = useMemo(() => {
        let current = 0;
        let previous = 0;
        for (const p of patients) {
            if (withinLocalBounds(p.created_at, bounds.start, bounds.end)) {
                current += 1;
            } else if (withinLocalBounds(p.created_at, previousBounds.start, previousBounds.end)) {
                previous += 1;
            }
        }
        return { current, previous, delta: computeDelta(current, previous) };
    }, [patients, bounds, previousBounds]);

    // KPI #4 — Completion rate = completed / appointments_already_past.
    // We exclude appointments still in the future from the denominator so
    // a dentist booking out several months doesn't appear to have a 5%
    // completion rate; only appointments whose time has passed count.
    const completionKpi = useMemo(() => {
        function calc(start: Date, end: Date): { completed: number; total: number; rate: number } {
            let completed = 0;
            let total = 0;
            const cutoff = now.getTime();
            for (const apt of appointments) {
                if (!withinLocalBounds(apt.appointment_date, start, end)) continue;
                // Skip future appointments: they haven't had a chance to be
                // completed or marked no-show yet. We compare appointment_date
                // (date-only) parsed locally against `now`.
                const aptDate = apt.appointment_date
                    ? new Date(
                        Number(apt.appointment_date.slice(0, 4)),
                        Number(apt.appointment_date.slice(5, 7)) - 1,
                        Number(apt.appointment_date.slice(8, 10)),
                        23, 59, 59
                    ).getTime()
                    : 0;
                if (aptDate > cutoff) continue;
                total += 1;
                if (apt.status === 'completed') completed += 1;
            }
            const rate = total > 0 ? (completed / total) * 100 : 0;
            return { completed, total, rate };
        }
        const c = calc(bounds.start, bounds.end);
        const p = calc(previousBounds.start, previousBounds.end);
        return {
            current: c.rate,
            previous: p.rate,
            delta: c.total > 0 && p.total > 0 ? computeDelta(c.rate, p.rate) : null,
            counts: c,
        };
    }, [appointments, bounds, previousBounds, now]);

    const revenueByBucket = useMemo(() => {
        return buckets.map((bucket) => {
            let revenue = 0;
            let debt = 0;
            for (const tr of treatments) {
                if (!bucket.match(tr.treatment_date)) continue;
                revenue += Number(tr.paid_amount ?? 0);
                // **Fix**: previously summed `debt_amount` (the gross charge)
                // here, which double-counted the paid portion of fully-paid
                // treatments. The bar now shows the actual outstanding balance.
                debt += outstandingBalance(tr);
            }
            return { month: bucket.label, revenue, debt };
        });
    }, [treatments, buckets]);

    const patientGrowth = useMemo(() => {
        return buckets.map((bucket, index) => {
            const newInBucket = patients.filter((p) => bucket.match(p.created_at)).length;
            // Cumulative count up to and including this bucket. We walk the
            // patient list once per bucket — small dataset, simpler than
            // pre-sorting + binary search.
            const cumulativeBucketKeys = new Set(buckets.slice(0, index + 1).map((b) => b.key));
            const total = patients.filter((p) => {
                if (!p.created_at) return false;
                for (const b of buckets) {
                    if (b.match(p.created_at) && cumulativeBucketKeys.has(b.key)) return true;
                }
                return false;
            }).length;
            return { month: bucket.label, total, new: newInBucket };
        });
    }, [patients, buckets]);

    // Appointment status pie — count by status WITHIN the selected range.
    // Previously this counted the entire dataset so the donut never
    // changed when the user toggled the range.
    const appointmentStatus = useMemo(() => {
        const counts: Record<string, number> = { scheduled: 0, completed: 0, cancelled: 0, no_show: 0 };
        for (const apt of appointments) {
            if (!withinLocalBounds(apt.appointment_date, bounds.start, bounds.end)) continue;
            const status = apt.status as keyof typeof counts;
            if (status in counts) counts[status] = (counts[status] ?? 0) + 1;
        }
        return Object.entries(counts).map(([status, count]) => ({
            status: status as ApiAppointment['status'],
            count,
        }));
    }, [appointments, bounds]);

    // Top debtors — aggregate outstanding balance per patient, but only
    // count treatments whose date sits in the selected range. Previously
    // returned all-time data regardless of range.
    const topDebtors = useMemo(() => {
        const grouped: Record<string, { name: string; phone: string; debt: number }> = {};
        for (const tr of treatments) {
            if (!withinLocalBounds(tr.treatment_date, bounds.start, bounds.end)) continue;
            const debt = outstandingBalance(tr);
            if (debt <= 0) continue;
            const patientId = tr.patient_id ?? 'unknown';
            const existing = grouped[patientId] ?? {
                name: tr.patient_name ?? '—',
                phone: extractPrimaryPhone(tr.patient_phone ?? '') || '',
                debt: 0,
            };
            existing.debt += debt;
            grouped[patientId] = existing;
        }
        return Object.values(grouped).sort((a, b) => b.debt - a.debt).slice(0, 5);
    }, [treatments, bounds]);

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
                orientation: 'portrait',
                columns: [
                    t('analytics.export.col.month'),
                    t('analytics.export.col.revenue'),
                    t('analytics.export.col.debt'),
                ],
                rows: revenueByBucket.map((row) => [
                    row.month,
                    formatCurrency(row.revenue),
                    formatCurrency(row.debt),
                ]),
                summary: [
                    { label: t('analytics.kpi.revenue'), value: formatCurrency(revenueKpi.current) },
                    { label: t('analytics.kpi.debt'), value: formatCurrency(debtKpi.current) },
                    { label: t('analytics.kpi.patients'), value: String(patientsKpi.current) },
                    {
                        label: t('analytics.kpi.completion'),
                        value: `${Math.round(completionKpi.current)}%`,
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
        revenueKpi.current,
        debtKpi.current,
        patientsKpi.current,
        completionKpi.current,
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

    const isAnyLoading =
        treatmentsQuery.isLoading
        || patientsQuery.isLoading
        || appointmentsQuery.isLoading
        || snapshotQuery.isLoading;

    if (isAnyLoading) {
        return <AnalyticsLoadingState />;
    }

    // Permission-aware layout: when an assistant lacks `payments.view`, the
    // 4-column KPI grid would otherwise leave two empty slots, and the
    // 3-col/2-col chart rows would leave a single chart sitting in a
    // fraction of the row width. Count the visible cells in each row and
    // pick a grid template that fills cleanly for any permission shape.
    const visibleKpiCount =
        (canViewPayments ? 2 : 0) + (canViewPatients ? 1 : 0) + (canViewAppointments ? 1 : 0);
    const kpiGridClass =
        visibleKpiCount <= 1
            ? 'grid grid-cols-1 gap-4'
            : visibleKpiCount === 2
                ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
                : visibleKpiCount === 3
                    ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
                    : 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4';

    const showRevenueChart = canViewPayments;
    const showStatusChart = canViewAppointments;
    const firstChartRowBoth = showRevenueChart && showStatusChart;
    const firstChartRowClass = firstChartRowBoth
        ? 'grid grid-cols-1 gap-2.5 lg:grid-cols-3'
        : 'grid grid-cols-1 gap-2.5';

    const showGrowthChart = canViewPatients;
    const showDebtorsCard = canViewPayments;
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

            <TimeRangeSelector value={range} onChange={setRange} />

            <div className={kpiGridClass}>
                {canViewPayments ? (
                    <KpiCard
                        label={t('analytics.kpi.revenue')}
                        description={t('analytics.kpi.revenue.descr')}
                        value={formatCurrency(revenueKpi.current)}
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
                        value={formatCurrency(debtKpi.current)}
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
                {canViewAppointments ? (
                    <KpiCard
                        label={t('analytics.kpi.completion')}
                        description={t('analytics.kpi.completion.descr')}
                        value={`${Math.round(completionKpi.current)}%`}
                        deltaPercent={completionKpi.delta}
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
                            <RevenueChart data={revenueByBucket} rangeLabel={t(`analytics.range.${range}`)} />
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
                    {showDebtorsCard ? <TopDebtorsCard data={topDebtors} /> : null}
                </div>
            ) : null}
        </div>
    );
}
