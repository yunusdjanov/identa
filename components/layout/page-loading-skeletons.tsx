import type { ReactNode } from 'react';

import { Brand } from '@/components/branding/brand';
import { authCardClassName } from '@/components/auth/auth-form-styles';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function PageHeaderSkeleton({ actions = 1, eyebrow = false }: { actions?: number; eyebrow?: boolean }) {
    return (
        <section className="overflow-hidden rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm shadow-slate-200/70 sm:rounded-2xl sm:px-5 sm:py-4">
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1">
                    {eyebrow ? <Skeleton className="h-3 w-16 rounded-xl" /> : null}
                    <Skeleton className="h-7 w-40 rounded-xl sm:h-8 sm:w-56" />
                    <Skeleton className="h-3.5 w-52 max-w-full rounded-xl sm:w-72" />
                </div>
                {actions > 0 ? (
                    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                        {Array.from({ length: actions }).map((_, index) => (
                            <Skeleton key={index} className="h-7 w-full rounded-full sm:w-28" />
                        ))}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

function MetricCardsSkeleton({ count = 3 }: { count?: number }) {
    // Grid breakpoints follow the cardinality: 3 cards → md:grid-cols-3
    // (used by /admin and /admin/dentists/[id]/staff), 4 cards →
    // md:grid-cols-2 xl:grid-cols-4 (used by /payments). Earlier the
    // skeleton always added `xl:grid-cols-4` which caused 3 cards to
    // redistribute across 4 cols on xl viewports, then snap to 3 once
    // real data rendered — a visible jump on wide displays.
    const gridCols = count === 4
        ? 'md:grid-cols-2 xl:grid-cols-4'
        : 'md:grid-cols-3';
    return (
        <div className={`grid grid-cols-1 gap-4 ${gridCols}`}>
            {Array.from({ length: count }).map((_, index) => (
                <Card
                    key={index}
                    data-testid="metric-card-skeleton"
                    className="rounded-2xl border-slate-200 bg-white shadow-sm"
                >
                    <CardContent className="flex min-h-[136px] flex-col justify-between p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-3">
                                <Skeleton className="h-4 w-32 rounded-xl" />
                                <Skeleton className="h-8 w-28 rounded-xl" />
                            </div>
                            <Skeleton className="h-10 w-10 rounded-2xl" />
                        </div>
                        <Skeleton className="h-4 w-24 rounded-xl" />
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}

function DataTableSkeleton({
    columns = 5,
    rows = 5,
    testId,
}: {
    columns?: number;
    rows?: number;
    testId?: string;
}) {
    return (
        <Card data-testid={testId} className="rounded-2xl border-slate-200 bg-white shadow-sm">
            <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <Skeleton className="h-6 w-44 rounded-xl" />
                    <Skeleton className="h-10 w-full rounded-xl sm:w-64" />
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div
                    className="hidden gap-3 md:grid"
                    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                >
                    {Array.from({ length: columns }).map((_, index) => (
                        <Skeleton key={index} className="h-4 w-full rounded-xl" />
                    ))}
                </div>
                {Array.from({ length: rows }).map((_, rowIndex) => (
                    <div
                        key={rowIndex}
                        className="grid gap-3 rounded-xl border border-slate-100 bg-white p-3 md:border-0 md:bg-transparent md:p-0"
                        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                    >
                        {Array.from({ length: columns }).map((__, columnIndex) => (
                            <Skeleton
                                key={columnIndex}
                                className="h-4 min-w-0 rounded-xl"
                            />
                        ))}
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

function TabStripSkeleton({ count = 2 }: { count?: number }) {
    return (
        <div className="flex gap-2 overflow-x-auto overflow-y-hidden no-scrollbar">
            {Array.from({ length: count }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-32 shrink-0 rounded-xl" />
            ))}
        </div>
    );
}

function AdminHeaderSkeleton() {
    return (
        <header className="border-b border-teal-100/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,251,255,0.94)_100%)]">
            <div className="mx-auto max-w-[1440px] px-3 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">
                    <Skeleton className="h-10 w-36 rounded-md" />
                    <div className="hidden items-center gap-3 sm:flex">
                        <Skeleton className="h-10 w-16 rounded-xl" />
                        <Skeleton className="h-10 w-28 rounded-xl" />
                        <Skeleton className="h-10 w-24 rounded-xl" />
                    </div>
                    <Skeleton className="h-10 w-10 rounded-full sm:hidden" />
                </div>
            </div>
        </header>
    );
}

function AdminShellSkeleton({
    children,
    maxWidth = 'max-w-[1440px]',
}: {
    children: ReactNode;
    maxWidth?: string;
}) {
    return (
        <div
            data-testid="admin-shell-loading"
            className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(209,228,255,0.7),transparent_34rem),linear-gradient(180deg,#eaf1f8_0%,#e8edf5_45%,#e2e8f0_100%)]"
        >
            <AdminHeaderSkeleton />
            <main className="px-3 py-3 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
                <div className={`mx-auto ${maxWidth} space-y-5 lg:space-y-6`}>
                    {children}
                </div>
            </main>
        </div>
    );
}

export function RouteDashboardLoadingState() {
    return (
        <div data-testid="dashboard-loading" className="space-y-3">
            {/* Header banner */}
            <section className="overflow-hidden rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm shadow-slate-200/70 sm:px-5 sm:py-4">
                <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1.5">
                        <Skeleton className="h-3 w-16 rounded-xl" />
                        <Skeleton className="h-7 w-48 rounded-xl" />
                        <Skeleton className="h-3.5 w-56 rounded-xl" />
                    </div>
                    <div className="flex gap-2">
                        <Skeleton className="h-7 w-28 rounded-full" />
                        <Skeleton className="h-7 w-28 rounded-full" />
                    </div>
                </div>
            </section>
            {/* Stat cards — 3 cols, compact */}
            <div className="grid gap-2.5 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border bg-white px-4 py-3.5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <Skeleton className="h-3.5 w-28 rounded-xl" />
                            <Skeleton className="h-7 w-7 rounded-lg" />
                        </div>
                        <Skeleton className="mt-2.5 h-7 w-20 rounded-xl" />
                    </div>
                ))}
            </div>
            {/* Upcoming today block */}
            <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-6 w-6 rounded-md" />
                        <Skeleton className="h-4 w-32 rounded-xl" />
                    </div>
                    <Skeleton className="h-4 w-16 rounded-xl" />
                </div>
                <div className="divide-y divide-slate-100/80 px-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 py-2.5">
                            <Skeleton className="h-8 w-[3.8rem] shrink-0 rounded-full" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-3.5 w-40 rounded-xl" />
                                <Skeleton className="h-3 w-24 rounded-xl" />
                            </div>
                            <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function AppointmentsLoadingState() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={1} />
            <Card className="rounded-2xl border-teal-100/80 bg-white shadow-sm">
                <CardContent className="space-y-4 p-3 sm:p-5">
                    <div className="flex flex-col gap-3 rounded-2xl border border-teal-100/80 bg-teal-50/30 p-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex gap-2">
                            <Skeleton className="h-10 w-24 rounded-lg" />
                            <Skeleton className="h-10 w-24 rounded-lg" />
                        </div>
                        <Skeleton className="h-10 w-full rounded-xl md:w-64" />
                        <Skeleton className="h-10 w-full rounded-xl md:w-24" />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-7">
                        {Array.from({ length: 7 }).map((_, index) => (
                            <div key={index} className="min-h-[15rem] rounded-2xl border border-slate-100 bg-slate-50/70 p-2">
                                <div className="mb-2 flex items-center justify-between">
                                    <Skeleton className="h-5 w-16 rounded-xl" />
                                    <Skeleton className="h-5 w-7 rounded-full" />
                                </div>
                                <div className="space-y-1.5">
                                    <Skeleton className="h-8 w-full rounded-lg" />
                                    <Skeleton className="h-8 w-full rounded-lg" />
                                    <Skeleton className="h-8 w-4/5 rounded-lg" />
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export function PatientsLoadingState() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={2} />
            <Card className="rounded-2xl border-slate-200 bg-white">
                <CardContent className="p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_12rem_12rem_10rem]">
                        <Skeleton className="h-10 rounded-xl" />
                        <Skeleton className="h-10 rounded-xl" />
                        <Skeleton className="h-10 rounded-xl" />
                        <Skeleton className="h-10 rounded-xl" />
                    </div>
                </CardContent>
            </Card>
            <DataTableSkeleton columns={7} rows={6} />
        </div>
    );
}

export function PaymentsLoadingState() {
    // The real page (`app/payments/page.tsx`) keeps the toolbar (tab group +
    // search) AND the ledger table inside ONE `overflow-hidden rounded-2xl`
    // card. The earlier skeleton split them into three free-floating blocks
    // (bare tab pills → a standalone search card → a separate table card),
    // so the layout reshuffled when data landed. Mirror the single-card shape.
    return (
        <div data-testid="payments-loading" className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={0} />
            <MetricCardsSkeleton count={4} />
            <Card data-testid="ledger-table-skeleton" className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <CardContent className="space-y-5 p-4 sm:p-5">
                    {/* Toolbar: 2-tab segmented control (left) + search (right) */}
                    <div className="flex flex-col gap-4 rounded-2xl border border-teal-100/80 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="inline-flex w-full items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 sm:w-auto">
                            <Skeleton className="h-9 flex-1 rounded-lg sm:w-28 sm:flex-none" />
                            <Skeleton className="h-9 flex-1 rounded-lg sm:w-28 sm:flex-none" />
                        </div>
                        <Skeleton className="h-9 w-full rounded-xl sm:w-[22rem]" />
                    </div>
                    {/* Ledger rows */}
                    <div className="space-y-3">
                        <div
                            className="hidden gap-3 md:grid"
                            style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
                        >
                            {Array.from({ length: 6 }).map((_, index) => (
                                <Skeleton key={index} className="h-4 w-full rounded-xl" />
                            ))}
                        </div>
                        {Array.from({ length: 7 }).map((_, rowIndex) => (
                            <div
                                key={rowIndex}
                                className="grid gap-3 rounded-xl border border-slate-100 bg-white p-3 md:border-0 md:bg-transparent md:p-0"
                                style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
                            >
                                {Array.from({ length: 6 }).map((__, columnIndex) => (
                                    <Skeleton key={columnIndex} className="h-4 min-w-0 rounded-xl" />
                                ))}
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export function SettingsLoadingState() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={0} />
            <TabStripSkeleton count={4} />
            <Card className="rounded-2xl border-slate-200 bg-white">
                <CardHeader>
                    <Skeleton className="h-6 w-44 rounded-xl" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="space-y-2">
                                <Skeleton className="h-4 w-24 rounded-xl" />
                                <Skeleton className="h-10 w-full rounded-xl" />
                            </div>
                        ))}
                    </div>
                    <Skeleton className="h-10 w-full rounded-xl sm:w-36" />
                </CardContent>
            </Card>
        </div>
    );
}

export function BillingLoadingState() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={0} />
            <Card className="rounded-2xl border-teal-100 bg-white">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-3">
                        <Skeleton className="h-4 w-28 rounded-xl" />
                        <Skeleton className="h-8 w-48 rounded-xl" />
                        <Skeleton className="h-4 w-64 rounded-xl" />
                    </div>
                    <Skeleton className="h-16 w-full rounded-xl sm:w-72" />
                </CardContent>
            </Card>
            <Skeleton className="h-10 w-full rounded-2xl sm:w-56" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index} className="rounded-2xl border-slate-200 bg-white">
                        <CardHeader className="space-y-3">
                            <Skeleton className="h-6 w-36 rounded-xl" />
                            <Skeleton className="h-10 w-full rounded-xl" />
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Skeleton className="h-9 w-32 rounded-xl" />
                            {Array.from({ length: 4 }).map((__, itemIndex) => (
                                <Skeleton key={itemIndex} className="h-4 w-full rounded-xl" />
                            ))}
                            <Skeleton className="h-10 w-full rounded-xl" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <DataTableSkeleton columns={5} rows={4} />
        </div>
    );
}

export function StaffLoadingState() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={0} />
            <TabStripSkeleton count={2} />
            <Card className="rounded-2xl border-slate-200 bg-white">
                <CardHeader>
                    <Skeleton className="h-6 w-44 rounded-xl" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <Skeleton className="h-28 w-full rounded-xl" />
                </CardContent>
            </Card>
        </div>
    );
}

export function PatientDetailLoadingState() {
    return (
        <div className="space-y-4">
            {/* Header — matches actual page */}
            <section className="rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm shadow-slate-200/70 sm:px-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 shrink-0 rounded-xl" />
                        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                        <div className="space-y-1.5">
                            <Skeleton className="h-[22px] w-44 rounded-xl" />
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-4 w-28 rounded-xl" />
                                <Skeleton className="h-5 w-16 rounded-full" />
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Skeleton className="h-7 w-32 rounded-full" />
                        <Skeleton className="h-7 w-24 rounded-full" />
                        <Skeleton className="h-7 w-36 rounded-full" />
                    </div>
                </div>
            </section>

            {/* 3 info cards — gap-3, rounded-2xl, solid icon badge, icon+label left / value right */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {[4, 3, 3].map((rowCount, cardIndex) => (
                    <div key={cardIndex} className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm shadow-slate-100/80">
                        {/* Header: h-7 w-7 rounded-lg badge + title */}
                        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-1.5">
                            <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
                            <Skeleton className="h-[14px] w-32 rounded-xl" />
                        </div>
                        {/* InfoRows: icon+label group left, value right */}
                        <div className="px-4 pb-3 pt-0">
                            {Array.from({ length: rowCount }).map((_, rowIndex) => (
                                <div
                                    key={rowIndex}
                                    className="flex items-center justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0"
                                >
                                    <div className="flex items-center gap-2">
                                        <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
                                        <Skeleton className="h-3 w-16 rounded-xl" />
                                    </div>
                                    <Skeleton className="h-3.5 w-24 rounded-xl" />
                                </div>
                            ))}
                            {/* Visit card history link */}
                            {cardIndex === 2 ? (
                                <div className="border-t border-slate-100 pt-2.5">
                                    <Skeleton className="h-6 w-28 rounded-lg" />
                                </div>
                            ) : null}
                        </div>
                    </div>
                ))}
            </div>

            <div
                data-testid="patient-detail-oral-photo-skeleton"
                className="overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/30"
            >
                <div className="flex items-center justify-between gap-3 border-b border-slate-100/80 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
                        <Skeleton className="h-4 w-32 rounded-xl" />
                    </div>
                    <Skeleton className="h-5 w-12 shrink-0 rounded-full" />
                </div>
                <div className="grid md:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div
                            key={index}
                            data-testid="patient-detail-oral-photo-slot-skeleton"
                            className={`min-w-0 p-2.5 ${index > 0 ? 'border-t border-slate-100 md:border-l md:border-t-0' : ''}`}
                        >
                            <div className="flex min-w-0 items-center gap-2.5">
                                <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <Skeleton className="h-4 w-20 rounded-xl" />
                                        <Skeleton className="h-3 w-14 shrink-0 rounded-xl" />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Skeleton className="h-7 w-20 rounded-full" />
                                        <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Appointments card — rounded-2xl, border, h-8 w-8 icon badge, time pill rows */}
            <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm shadow-slate-100/80">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-1.5">
                    <div className="flex items-center gap-2.5">
                        <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
                        <Skeleton className="h-[14px] w-20 rounded-xl" />
                    </div>
                    <Skeleton className="h-7 w-36 rounded-full" />
                </div>
                <div className="divide-y divide-slate-100">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3">
                            <Skeleton className="h-8 w-[3.25rem] shrink-0 rounded-lg" />
                            <div className="flex-1 space-y-1.5">
                                <Skeleton className="h-3.5 w-40 rounded-xl" />
                                <Skeleton className="h-3 w-24 rounded-xl" />
                            </div>
                            <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function AdminAnalyticsLoadingState() {
    // Mirrors the real /admin/analytics layout:
    // - admin shell background + header
    // - PageHeader with 1 action (Export PDF)
    // - Time range pill group
    // - 4 KPI cards (sm:grid-cols-2, xl:grid-cols-4)
    // - Single chart row: subscription health donut (1 col) + signup growth
    //   line (2 col) on lg+
    // The previous skeleton (AdminDashboardLoadingState) drew 3 metric cards
    // + table, which caused a visible relayout when data landed and the page
    // switched to the 4-KPI + 2-chart shape.
    return (
        <AdminShellSkeleton>
            <PageHeaderSkeleton actions={1} />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Skeleton className="h-3 w-16 rounded-xl" />
                <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={index} className="h-7 w-16 rounded-lg" />
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Card key={index} className="rounded-2xl border-slate-200 bg-white shadow-sm">
                        <CardContent className="space-y-3 p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1.5">
                                    <Skeleton className="h-3 w-20 rounded-xl" />
                                    <Skeleton className="h-3 w-32 rounded-xl" />
                                </div>
                                <Skeleton className="h-10 w-10 rounded-2xl" />
                            </div>
                            <Skeleton className="h-7 w-28 rounded-xl" />
                            <Skeleton className="h-3 w-24 rounded-xl" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
                <Skeleton className="h-[260px] rounded-2xl" />
                <Skeleton className="h-[260px] rounded-2xl lg:col-span-2" />
            </div>
        </AdminShellSkeleton>
    );
}

export function AnalyticsLoadingState() {
    // Mirrors the real /analytics page:
    // - PageHeader with 1 action (Export PDF)
    // - Time range pill group
    // - 4 KPI cards (md:grid-cols-2, xl:grid-cols-4)
    // - Top chart row: revenue (col-span-2) + appointment status
    // - Bottom chart row: patient growth + top debtors
    // Heights are approximate but close enough that the page doesn't jump
    // when data arrives.
    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={1} />
            {/* Time range pill group */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Skeleton className="h-3 w-16 rounded-xl" />
                <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={index} className="h-7 w-16 rounded-lg" />
                    ))}
                </div>
            </div>
            {/* KPI cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <Card key={index} className="rounded-2xl border-slate-200 bg-white shadow-sm">
                        <CardContent className="space-y-3 p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1.5">
                                    <Skeleton className="h-3 w-20 rounded-xl" />
                                    <Skeleton className="h-3 w-32 rounded-xl" />
                                </div>
                                <Skeleton className="h-10 w-10 rounded-2xl" />
                            </div>
                            <Skeleton className="h-7 w-28 rounded-xl" />
                            <Skeleton className="h-3 w-24 rounded-xl" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            {/* First chart row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Skeleton className="h-[300px] rounded-2xl lg:col-span-2" />
                <Skeleton className="h-[300px] rounded-2xl" />
            </div>
            {/* Second chart row */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Skeleton className="h-[280px] rounded-2xl" />
                <Skeleton className="h-[280px] rounded-2xl" />
            </div>
        </div>
    );
}

export function PatientHistoryLoadingState() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={1} />
            <Card className="rounded-2xl border-slate-200 bg-white">
                <CardHeader>
                    <Skeleton className="h-6 w-56 rounded-xl" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                        <Skeleton className="h-10 rounded-xl" />
                        <Skeleton className="h-10 rounded-xl" />
                        <Skeleton className="h-10 rounded-xl" />
                    </div>
                    <Skeleton className="h-[22rem] w-full rounded-2xl" />
                </CardContent>
            </Card>
        </div>
    );
}

export function OdontogramLoadingState() {
    const toothRow = (count: number) => (
        <div className="flex gap-0.5 sm:gap-1">
            {Array.from({ length: count }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-8 rounded-lg sm:h-14 sm:w-10 md:h-16 md:w-12" />
            ))}
        </div>
    );

    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={1} />
            <Card className="rounded-2xl border-slate-200 bg-white">
                <CardHeader>
                    <Skeleton className="h-6 w-64 rounded-xl" />
                </CardHeader>
                <CardContent className="space-y-5 overflow-x-auto">
                    {/* Upper jaw */}
                    <div className="space-y-2">
                        <Skeleton className="mx-auto h-4 w-20 rounded-xl" />
                        <div className="flex justify-center gap-4 sm:gap-6 md:gap-8">
                            <div className="space-y-1.5">
                                <Skeleton className="mx-auto h-3 w-20 rounded-xl" />
                                {toothRow(8)}
                            </div>
                            <div className="space-y-1.5">
                                <Skeleton className="mx-auto h-3 w-20 rounded-xl" />
                                {toothRow(8)}
                            </div>
                        </div>
                    </div>
                    <div className="border-t-2 border-slate-300" />
                    {/* Lower jaw */}
                    <div className="space-y-2">
                        <Skeleton className="mx-auto h-4 w-20 rounded-xl" />
                        <div className="flex justify-center gap-4 sm:gap-6 md:gap-8">
                            <div className="space-y-1.5">
                                <Skeleton className="mx-auto h-3 w-20 rounded-xl" />
                                {toothRow(8)}
                            </div>
                            <div className="space-y-1.5">
                                <Skeleton className="mx-auto h-3 w-20 rounded-xl" />
                                {toothRow(8)}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export function AdminDashboardLoadingState() {
    // Mirrors the real /admin page (`app/admin/page.tsx`):
    // - Page header banner with no actions in the header itself
    // - 3 metric cards (Total dentists, Active, Blocked) — md:grid-cols-3
    // - Dentist table card whose CardHeader contains Tabs (Active/Archive)
    //   + Search input + "Add dentist" button, then a 7-col table body
    //   (Name, Email, Subscription, RegDate, Status, LastLogin, Actions).
    //   The plain DataTableSkeleton only renders "title + search", which
    //   omits the tabs and button — replicating the real CardHeader here
    //   keeps the layout stable when data lands.
    return (
        <AdminShellSkeleton>
            <PageHeaderSkeleton actions={0} />
            <MetricCardsSkeleton count={3} />
            <Card className="rounded-2xl border-slate-200 bg-white shadow-sm">
                <CardHeader>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {/* TabsList: 2 triggers, h-9 to match the real component */}
                        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                            <Skeleton className="h-8 w-24 rounded-lg" />
                            <Skeleton className="h-8 w-24 rounded-lg" />
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                            <Skeleton className="h-9 w-full rounded-xl sm:w-64" />
                            <Skeleton className="h-9 w-full rounded-xl sm:w-36" />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-5 sm:px-5">
                    <div
                        className="hidden gap-3 md:grid"
                        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
                    >
                        {Array.from({ length: 7 }).map((_, index) => (
                            <Skeleton key={index} className="h-4 w-full rounded-xl" />
                        ))}
                    </div>
                    {Array.from({ length: 6 }).map((_, rowIndex) => (
                        <div
                            key={rowIndex}
                            className="grid gap-3 rounded-xl border border-slate-100 bg-white p-3 md:border-0 md:bg-transparent md:p-0"
                            style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
                        >
                            {Array.from({ length: 7 }).map((__, colIndex) => (
                                <Skeleton key={colIndex} className="h-4 min-w-0 rounded-xl" />
                            ))}
                        </div>
                    ))}
                </CardContent>
            </Card>
        </AdminShellSkeleton>
    );
}

export function AdminPlansLoadingState() {
    return (
        <AdminShellSkeleton>
            <PageHeaderSkeleton actions={0} />
            <AdminPlansPanelSkeleton />
        </AdminShellSkeleton>
    );
}

export function AdminSettingsLoadingState() {
    return (
        <AdminShellSkeleton>
            <PageHeaderSkeleton actions={0} />
            <Card className="rounded-2xl border-slate-200 bg-white">
                <CardHeader>
                    <Skeleton className="h-6 w-36 rounded-xl" />
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24 rounded-xl" />
                        <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20 rounded-xl" />
                        <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                </CardContent>
            </Card>
            <Card className="rounded-2xl border-slate-200 bg-white">
                <CardHeader>
                    <Skeleton className="h-6 w-44 rounded-xl" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-20 w-full rounded-xl" />
                </CardContent>
            </Card>
        </AdminShellSkeleton>
    );
}

export function AdminPlansPanelSkeleton() {
    return <DataTableSkeleton columns={6} rows={4} />;
}

export function AdminDentistBillingLoadingState() {
    // Mirrors the real page (`app/admin/dentists/[id]/billing/page.tsx`):
    // - Default max-w-[1440px] container — kept in sync with the dentist-side
    //   and every other admin page so there's no horizontal jump on load.
    // - Back link, dentist identity header with 3 inline metric columns,
    //   plan picker grid, state-management card, danger zone, and an
    //   activity card with tabs.
    // Optional banners (subscription note, pending-change alert) aren't
    // included — they only render when their data fields are populated and
    // we can't predict them at skeleton time.
    return (
        <AdminShellSkeleton>
            <Skeleton className="h-5 w-32 rounded-xl" />
            {/* Dentist header card */}
            <Card className="rounded-2xl border-slate-200 bg-white shadow-sm shadow-slate-200/60">
                <CardContent className="p-5">
                    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:items-center lg:gap-0">
                        <div className="flex min-w-0 items-center gap-4 lg:pr-4">
                            <Skeleton className="h-14 w-14 shrink-0 rounded-full sm:h-16 sm:w-16" />
                            <div className="min-w-0 space-y-2">
                                <Skeleton className="h-6 w-44 rounded-xl sm:h-7 sm:w-56" />
                                <Skeleton className="h-4 w-40 rounded-xl" />
                                <div className="flex items-center gap-2">
                                    <Skeleton className="h-5 w-20 rounded-full" />
                                    <Skeleton className="h-4 w-24 rounded-xl" />
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 divide-x divide-slate-200 lg:col-span-3 lg:grid-cols-subgrid lg:divide-x-0">
                            {Array.from({ length: 3 }).map((_, index) => (
                                <div
                                    key={index}
                                    className="min-w-0 space-y-2 px-3 sm:px-4 lg:border-l lg:border-slate-200 lg:px-5"
                                >
                                    <Skeleton className="h-3 w-20 rounded-xl" />
                                    <Skeleton className="h-5 w-28 rounded-xl" />
                                    <Skeleton className="h-3 w-16 rounded-xl" />
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
            {/* Plan picker grid (3 plan cards) */}
            <div className="grid gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index} className="rounded-2xl border-slate-200 bg-white">
                        <CardHeader className="space-y-3">
                            <Skeleton className="h-5 w-24 rounded-xl" />
                            <Skeleton className="h-8 w-32 rounded-xl" />
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {Array.from({ length: 3 }).map((__, lineIndex) => (
                                <Skeleton key={lineIndex} className="h-3.5 w-full rounded-xl" />
                            ))}
                            <Skeleton className="h-9 w-full rounded-xl" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            {/* State management card (4 action buttons) */}
            <Card className="rounded-2xl border-slate-200 bg-white">
                <CardHeader>
                    <Skeleton className="h-5 w-40 rounded-xl" />
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <Skeleton key={index} className="h-10 w-full rounded-xl" />
                    ))}
                </CardContent>
            </Card>
            {/* Activity card with tab strip + inline 5-col table.
                DataTableSkeleton wraps itself in a Card, so we render rows
                inline here rather than nesting Cards. The tabs strip lives
                above the table to match ActivityTabsCard. */}
            <Card className="rounded-2xl border-slate-200 bg-white">
                <CardHeader>
                    <TabStripSkeleton count={2} />
                </CardHeader>
                <CardContent className="space-y-3">
                    <div
                        className="hidden gap-3 md:grid"
                        style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
                    >
                        {Array.from({ length: 5 }).map((_, index) => (
                            <Skeleton key={index} className="h-4 w-full rounded-xl" />
                        ))}
                    </div>
                    {Array.from({ length: 5 }).map((_, rowIndex) => (
                        <div
                            key={rowIndex}
                            className="grid gap-3 rounded-xl border border-slate-100 bg-white p-3 md:border-0 md:bg-transparent md:p-0"
                            style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
                        >
                            {Array.from({ length: 5 }).map((__, colIndex) => (
                                <Skeleton key={colIndex} className="h-4 min-w-0 rounded-xl" />
                            ))}
                        </div>
                    ))}
                </CardContent>
            </Card>
        </AdminShellSkeleton>
    );
}

export function AdminPaymentsLoadingState() {
    // Mirrors the real page (`app/admin/payments/page.tsx`):
    // - Page header (no actions in header itself; filters live in the table card)
    // - 3 gradient summary cards (this month, this year, all time) —
    //   sm:grid-cols-3
    // - Filter bar inside the table card (date-from, date-to, status select,
    //   search input) — flex-col → lg:flex-row
    // - 6-column data table (Date, Dentist, Plan, Amount, Status, Actions)
    return (
        <AdminShellSkeleton>
            <PageHeaderSkeleton actions={0} />
            {/* Summary cards: real page uses sm:grid-cols-3, not md:grid-cols-3
                — replicating the same grid breakpoint avoids a relayout flash
                when the data arrives. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Card
                        key={index}
                        data-testid="metric-card-skeleton"
                        className="rounded-2xl border-slate-200 bg-white shadow-sm"
                    >
                        <CardContent className="flex items-center justify-between gap-3 p-5">
                            <div className="space-y-3">
                                <Skeleton className="h-4 w-32 rounded-xl" />
                                <Skeleton className="h-7 w-28 rounded-xl" />
                                {index === 2 ? <Skeleton className="h-3 w-20 rounded-xl" /> : null}
                            </div>
                            <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
                        </CardContent>
                    </Card>
                ))}
            </div>
            <Card className="overflow-hidden rounded-2xl bg-white">
                {/* Filter bar */}
                <div className="border-b border-slate-200/70 p-5 sm:p-6">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
                        <Skeleton className="h-10 w-full rounded-xl lg:w-40" />
                        <Skeleton className="h-10 w-full rounded-xl lg:w-40" />
                        <Skeleton className="h-10 w-full rounded-xl lg:ml-auto lg:w-48" />
                        <Skeleton className="h-10 w-full rounded-xl lg:w-72" />
                    </div>
                </div>
                {/* Table */}
                <CardContent className="space-y-3 px-4 pb-5 sm:px-5">
                    <div
                        className="hidden gap-3 md:grid"
                        style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
                    >
                        {Array.from({ length: 6 }).map((_, index) => (
                            <Skeleton key={index} className="h-4 w-full rounded-xl" />
                        ))}
                    </div>
                    {Array.from({ length: 8 }).map((_, rowIndex) => (
                        <div
                            key={rowIndex}
                            className="grid gap-3 rounded-xl border border-slate-100 bg-white p-3 md:border-0 md:bg-transparent md:p-0"
                            style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
                        >
                            {Array.from({ length: 6 }).map((__, colIndex) => (
                                <Skeleton key={colIndex} className="h-4 min-w-0 rounded-xl" />
                            ))}
                        </div>
                    ))}
                </CardContent>
            </Card>
        </AdminShellSkeleton>
    );
}

export function AdminDentistStaffLoadingState() {
    // Mirrors the real page (`app/admin/dentists/[id]/staff/page.tsx`):
    // - 1 header action (Back to dashboard button)
    // - 3 stat cards (Total, Active, Blocked) — md:grid-cols-3
    // - 6 desktop table columns (Member, Phone, Status, Permissions,
    //   LastLogin, Created). On mobile the page switches to a card list,
    //   but the desktop column count is what the table-row skeleton mirrors.
    return (
        <AdminShellSkeleton>
            <PageHeaderSkeleton actions={1} />
            <MetricCardsSkeleton count={3} />
            <DataTableSkeleton columns={6} rows={4} />
        </AdminShellSkeleton>
    );
}

export function AuthFormLoadingState({
    fieldCount,
    showOAuth = false,
    showRememberAndForgot = false,
}: {
    fieldCount: number;
    showOAuth?: boolean;
    /**
     * Login pages (`/login`, `/admin/login`) render a "Remember me" checkbox
     * on the left and a "Forgot password?" link on the right between the
     * password field and the submit button. Without representing this row,
     * the skeleton is ~36px shorter than the real form and the submit button
     * jumps up by one row when data lands. Defaults to false because the
     * other auth surfaces (register, reset, forgot) don't have this row.
     */
    showRememberAndForgot?: boolean;
}) {
    return (
        <div
            data-testid="auth-form-loading"
            className="relative min-h-screen overflow-hidden bg-[#e5f5f5] text-slate-950"
        >
            <div className="auth-teal-gradient pointer-events-none absolute inset-0" />
            <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-4 sm:px-6 lg:px-8">
                <header className="flex min-h-12 items-center justify-between gap-3">
                    <Brand href="/" variant="text" priority textClassName="w-36 sm:w-40" />
                    <div className="flex items-center gap-2">
                        <Skeleton className="hidden h-9 w-36 rounded-full bg-white/60 sm:block" />
                        <Skeleton className="h-9 w-20 rounded-full bg-white/70" />
                    </div>
                </header>

                <section className="flex flex-1 items-center justify-center py-6 sm:py-8 lg:py-10">
                    <div className="w-full max-w-[408px]">
                        <Card className={authCardClassName}>
                            <CardHeader className="space-y-2 px-5 pb-3 pt-5 text-center sm:px-7 sm:pb-4 sm:pt-7">
                                <div className="space-y-2">
                                    <Skeleton className="mx-auto h-6 w-44 rounded-xl" />
                                    <Skeleton className="mx-auto h-4 w-56 max-w-full rounded-xl" />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3.5 px-5 pb-5 sm:px-7 sm:pb-7">
                                {fieldCount > 2 ? (
                                    <div className="flex justify-center">
                                        <Skeleton className="h-9 w-40 rounded-full bg-white" />
                                    </div>
                                ) : null}
                                {Array.from({ length: fieldCount }).map((_, index) => (
                                    <div key={index} data-testid="auth-field-skeleton" className="space-y-2">
                                        <Skeleton className="h-4 w-24 rounded-xl" />
                                        <Skeleton className="h-10 w-full rounded-xl" />
                                    </div>
                                ))}
                                {showRememberAndForgot ? (
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <Skeleton className="h-4 w-4 rounded" />
                                            <Skeleton className="h-3.5 w-24 rounded-xl" />
                                        </div>
                                        <Skeleton className="h-3.5 w-28 rounded-xl" />
                                    </div>
                                ) : null}
                                <Skeleton className="h-10 w-full rounded-full" />
                                {showOAuth ? (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <Skeleton className="h-px flex-1" />
                                            <Skeleton className="h-3 w-16 rounded-xl" />
                                            <Skeleton className="h-px flex-1" />
                                        </div>
                                        <Skeleton className="h-10 w-full rounded-full" />
                                    </>
                                ) : null}
                                <Skeleton className="mx-auto h-4 w-40 rounded-xl" />
                            </CardContent>
                        </Card>
                    </div>
                </section>
            </div>
        </div>
    );
}
