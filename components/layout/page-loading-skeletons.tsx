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
        <div data-testid="dashboard-loading" className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={2} />
            <Card data-testid="dashboard-planner-skeleton" className="overflow-hidden rounded-2xl border-teal-100/80 bg-white shadow-sm shadow-teal-100/50">
                <CardContent className="space-y-4 p-3 sm:p-5 xl:pb-2.5">
                    <div className="flex flex-col gap-3 rounded-2xl border border-teal-100/80 bg-white p-3 shadow-xs md:flex-row md:items-center md:justify-between">
                        <div className="inline-flex w-full items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 shadow-xs sm:w-auto">
                            <Skeleton className="h-9 flex-1 rounded-lg sm:w-24 sm:flex-none" />
                            <Skeleton className="h-9 flex-1 rounded-lg sm:w-24 sm:flex-none" />
                        </div>
                        <div className="flex w-full min-w-0 items-center justify-center gap-2 md:w-auto">
                            <Skeleton className="h-9 w-9 rounded-xl" />
                            <Skeleton className="h-9 w-full rounded-xl md:w-64" />
                            <Skeleton className="h-9 w-9 rounded-xl" />
                        </div>
                        <Skeleton className="h-9 w-full rounded-xl md:w-24" />
                    </div>
                    <div className="border-t border-slate-100 pt-4">
                        <div className="hidden xl:grid xl:grid-cols-7 xl:gap-2.5">
                            {Array.from({ length: 7 }).map((_, index) => (
                                <div
                                    key={index}
                                    data-testid="dashboard-week-day-skeleton"
                                    className="min-h-[18rem] rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm shadow-slate-200/50"
                                >
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <Skeleton className="h-4 w-8 rounded-xl" />
                                            <Skeleton className="h-5 w-12 rounded-xl" />
                                        </div>
                                        <Skeleton className="h-6 w-7 rounded-full" />
                                    </div>
                                    <div className="min-h-[13rem] rounded-2xl border border-dashed border-teal-100/70 bg-slate-50/60 p-2">
                                        <div className="space-y-1.5">
                                            <Skeleton className="h-8 w-full rounded-xl" />
                                            <Skeleton className="h-8 w-11/12 rounded-xl" />
                                            <Skeleton className="h-8 w-4/5 rounded-xl" />
                                        </div>
                                    </div>
                                    <Skeleton className="mt-2 h-8 w-full rounded-xl" />
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div
                                    key={index}
                                    data-testid="dashboard-week-day-skeleton"
                                    className="min-h-[14rem] rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm shadow-slate-200/50"
                                >
                                    <div className="mb-3 flex items-center justify-between">
                                        <Skeleton className="h-5 w-20 rounded-xl" />
                                        <Skeleton className="h-6 w-7 rounded-full" />
                                    </div>
                                    <div className="space-y-2">
                                        <Skeleton className="h-9 w-full rounded-xl" />
                                        <Skeleton className="h-9 w-10/12 rounded-xl" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="hidden items-center justify-center gap-6 pt-1 xl:flex">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                                <Skeleton className="h-3 w-20 rounded-xl" />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
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
            <PageHeaderSkeleton actions={3} />
            <Card data-testid="patients-list-skeleton" className="overflow-visible rounded-2xl bg-white shadow-sm">
                <CardHeader className="gap-4 pb-4">
                    <Skeleton className="h-6 w-32 rounded-xl" />
                    <div
                        data-testid="patients-filter-toolbar-skeleton"
                        className="rounded-2xl border border-teal-100/80 bg-white p-3 shadow-sm shadow-teal-100/40 sm:p-4"
                    >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                            <Skeleton className="h-9 flex-1 rounded-xl" data-testid="patients-search-skeleton" />
                            <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
                                <Skeleton className="h-9 w-full min-w-[168px] rounded-xl md:w-[168px]" />
                                <Skeleton className="h-9 w-full min-w-[168px] rounded-xl md:w-[168px]" />
                                <Skeleton className="h-9 min-w-[120px] rounded-xl" />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4 px-4 pb-5 sm:px-5">
                    <div
                        data-testid="patients-table-shell-skeleton"
                        className="min-w-0 max-w-full overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/50"
                    >
                        <div
                            data-testid="patients-table-header-skeleton"
                            className="grid min-w-[760px] grid-cols-[3rem_7rem_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_8rem] items-center gap-3 bg-slate-50/80 px-4 py-3"
                        >
                            {Array.from({ length: 7 }).map((_, index) => (
                                <Skeleton key={index} className="h-4 w-full rounded-xl" />
                            ))}
                        </div>
                        {Array.from({ length: 6 }).map((_, rowIndex) => (
                            <div
                                key={rowIndex}
                                data-testid="patients-table-row-skeleton"
                                className="grid min-h-[6.25rem] min-w-[760px] grid-cols-[3rem_7rem_minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_8rem] items-center gap-3 border-t border-slate-100 px-4 py-3"
                            >
                                <Skeleton className="h-4 w-5 rounded-xl" />
                                <div className="relative h-16 w-20 overflow-visible">
                                    <Skeleton
                                        data-testid="patients-photo-skeleton"
                                        className="absolute left-0 top-1/2 h-20 w-20 -translate-y-1/2 rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Skeleton className="h-4 w-44 max-w-full rounded-xl" />
                                    <Skeleton className="h-3.5 w-32 rounded-xl" />
                                    <Skeleton className="h-5 w-28 rounded-full" />
                                </div>
                                <Skeleton className="h-5 w-28 rounded-full" />
                                <Skeleton className="h-4 w-24 rounded-xl" />
                                <Skeleton className="h-4 w-24 rounded-xl" />
                                <Skeleton className="ml-auto h-8 w-28 rounded-lg" />
                            </div>
                        ))}
                    </div>
                    <div
                        data-testid="patients-pagination-skeleton"
                        className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                    >
                        <Skeleton className="h-4 w-40 rounded-xl" />
                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                            <Skeleton className="h-8 w-24 rounded-xl" />
                            <Skeleton className="h-8 w-32 rounded-xl" />
                            <Skeleton className="h-8 w-20 rounded-xl" />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export function PaymentsLoadingState({ tab = 'patients' }: { tab?: 'patients' | 'expenses' } = {}) {
    const isExpensesTab = tab === 'expenses';
    const ledgerColumnCount = isExpensesTab ? 5 : 8;

    // The real page (`app/payments/page.tsx`) keeps the toolbar (tab group +
    // search) AND the ledger table inside ONE `overflow-hidden rounded-2xl`
    // card. The earlier skeleton split them into three free-floating blocks
    // (bare tab pills → a standalone search card → a separate table card),
    // so the layout reshuffled when data landed. Mirror the single-card shape.
    return (
        <div data-testid="payments-loading" className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={0} />
            <MetricCardsSkeleton count={4} />
            <Card
                data-testid={isExpensesTab ? 'expenses-table-skeleton' : 'ledger-table-skeleton'}
                className="overflow-hidden rounded-2xl bg-white shadow-sm"
            >
                <CardContent className="space-y-5 p-4 sm:p-5">
                    {/* Toolbar: tabs, search, and outstanding-debt filter. */}
                    <div className="flex flex-col gap-4 rounded-2xl border border-teal-100/80 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="inline-flex w-full items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 sm:w-auto">
                            <Skeleton className="h-9 flex-1 rounded-lg sm:w-28 sm:flex-none" />
                            <Skeleton className="h-9 flex-1 rounded-lg sm:w-28 sm:flex-none" />
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                            <Skeleton className="h-9 w-full rounded-xl sm:w-[22rem]" />
                            {isExpensesTab ? null : (
                                <Skeleton
                                    data-testid="payments-outstanding-filter-skeleton"
                                    className="h-9 w-full rounded-xl sm:w-28"
                                />
                            )}
                        </div>
                    </div>
                    {isExpensesTab ? (
                        <div data-testid="payments-expenses-form-skeleton" className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-3 md:grid-cols-[minmax(0,1fr)_11rem_8rem_8rem_11rem_9rem]">
                            <Skeleton className="h-10 rounded-xl" />
                            <Skeleton className="h-10 rounded-xl" />
                            <Skeleton className="h-10 rounded-xl" />
                            <Skeleton className="h-10 rounded-xl" />
                            <Skeleton className="h-10 rounded-xl" />
                            <Skeleton className="h-10 rounded-xl" />
                        </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/70 p-4">
                        <div className="space-y-2">
                            <Skeleton className={`h-5 rounded-xl ${isExpensesTab ? 'w-32' : 'w-36'}`} />
                            <Skeleton className={`h-4 max-w-full rounded-xl ${isExpensesTab ? 'w-44' : 'w-56'}`} />
                        </div>
                        <Skeleton className="h-8 w-28 rounded-full" />
                    </div>
                    {/* Ledger rows */}
                    <div className="space-y-3">
                        <div
                            className="hidden gap-3 md:grid"
                            data-testid="payments-ledger-header-skeleton"
                            style={{ gridTemplateColumns: `repeat(${ledgerColumnCount}, minmax(0, 1fr))` }}
                        >
                            {Array.from({ length: ledgerColumnCount }).map((_, index) => (
                                <Skeleton key={index} className="h-4 w-full rounded-xl" />
                            ))}
                        </div>
                        {Array.from({ length: 7 }).map((_, rowIndex) => (
                            <div
                                key={rowIndex}
                                className="grid gap-3 rounded-xl border border-slate-100 bg-white p-3 md:border-0 md:bg-transparent md:p-0"
                                data-testid="payments-ledger-row-skeleton"
                                style={{ gridTemplateColumns: `repeat(${ledgerColumnCount}, minmax(0, 1fr))` }}
                            >
                                {Array.from({ length: ledgerColumnCount }).map((__, columnIndex) => (
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
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)] lg:items-center xl:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)_auto]">
                    <div
                        data-testid="patient-detail-header-identity-skeleton"
                        className="flex w-full min-w-0 max-w-[20rem] items-center gap-3"
                    >
                        <Skeleton className="h-8 w-8 shrink-0 rounded-xl" />
                        <div className="relative h-16 w-20 shrink-0 overflow-visible">
                            <Skeleton className="absolute left-0 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                            <Skeleton className="h-[22px] w-full max-w-44 rounded-xl" />
                            <Skeleton className="h-[22px] w-4/5 max-w-36 rounded-xl" />
                            <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                    </div>
                    <div
                        data-testid="patient-detail-header-facts-skeleton"
                        className="grid h-[8rem] min-w-0 grid-rows-[1fr_auto_1fr] gap-1.5 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/60 px-2.5 py-2 shadow-sm shadow-slate-200/40 lg:col-span-2 lg:row-start-2 xl:col-span-1 xl:col-start-2 xl:row-start-1"
                    >
                        <div className="grid min-h-0 min-w-0 items-center gap-1.5 md:grid-cols-3">
                            {Array.from({ length: 3 }).map((_, index) => (
                                <div
                                    key={index}
                                    className="flex h-11 min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-white/80 bg-white/75 px-2.5 py-1.5"
                                >
                                    <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
                                    <Skeleton
                                        className={
                                            index === 2
                                                ? 'h-4 w-32 max-w-full rounded-xl'
                                                : 'h-4 w-24 max-w-full rounded-xl'
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                        <div aria-hidden="true" className="h-px bg-slate-200/70" />
                        <div className="grid min-h-0 min-w-0 items-center gap-1.5 md:grid-cols-3">
                            {Array.from({ length: 3 }).map((_, index) => (
                                <div
                                    key={index}
                                    className="flex h-10 min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-white/80 bg-white/70 px-2.5 py-1.5"
                                >
                                    <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
                                    <Skeleton className="h-4 w-16 max-w-full rounded-xl" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div
                        data-testid="patient-detail-header-actions-skeleton"
                        className="flex flex-col items-end gap-2 lg:col-start-2 lg:row-start-1 lg:justify-end xl:col-start-3"
                    >
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <Skeleton className="h-10 w-10 rounded-full" />
                        <Skeleton className="h-10 w-10 rounded-full" />
                    </div>
                </div>
            </section>

            {/* Summary cards: general photos and detail */}
            <div
                data-testid="patient-detail-summary-grid-skeleton"
                className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_15rem] xl:grid-cols-[minmax(0,1fr)_16rem]"
            >
                <div
                    data-testid="patient-detail-oral-photo-skeleton"
                    className="flex h-[20.75rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm shadow-slate-100/80"
                >
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-1.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
                            <Skeleton className="h-[14px] w-32 rounded-xl" />
                        </div>
                        <Skeleton className="h-5 w-12 shrink-0 rounded-full" />
                    </div>
                    <div className="grid flex-1 grid-cols-2 grid-rows-5 gap-2.5 px-4 py-3 sm:grid-cols-5 sm:grid-rows-2">
                        {Array.from({ length: 10 }).map((_, index) => (
                            <Skeleton
                                key={index}
                                data-testid="patient-detail-oral-photo-slot-skeleton"
                                className="min-h-[3.25rem] rounded-xl sm:min-h-0"
                            />
                        ))}
                    </div>
                </div>
                <div className="flex h-[20.75rem] flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm shadow-slate-100/80">
                    <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-1.5">
                        <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
                        <Skeleton className="h-[14px] w-32 rounded-xl" />
                    </div>
                    <div className="mx-px flex flex-1 flex-col divide-y divide-slate-100 overflow-hidden rounded-b-2xl bg-white">
                        {Array.from({ length: 3 }).map((_, rowIndex) => (
                            <div key={rowIndex} className="bg-white px-4 py-5">
                                <Skeleton className="mx-auto h-3 w-20 rounded-xl" />
                                <Skeleton className="mx-auto mt-3 h-4 w-24 rounded-xl" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div
                data-testid="patient-detail-work-history-skeleton"
                className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm shadow-slate-100/80"
            >
                <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-5 w-28 rounded-xl" />
                    <Skeleton className="h-10 w-32 rounded-full" />
                </div>
                <div className="mt-8 rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-6">
                        {Array.from({ length: 4 }).map((_, index) => (
                            <Skeleton key={index} className="h-4 w-28 rounded-xl" />
                        ))}
                    </div>
                </div>
                <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <Skeleton key={index} className="h-24 rounded-2xl" />
                    ))}
                </div>
                <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="grid grid-cols-4 gap-4 border-b border-slate-100 px-4 py-5 last:border-0">
                            {Array.from({ length: 4 }).map((__, cellIndex) => (
                                <Skeleton key={cellIndex} className="h-4 rounded-xl" />
                            ))}
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

export function AnalyticsLoadingState({
    visibleKpiCount = 4,
    showRevenueChart = true,
    showStatusChart = true,
    showGrowthChart = true,
    showDebtorsCard = true,
}: {
    visibleKpiCount?: number;
    showRevenueChart?: boolean;
    showStatusChart?: boolean;
    showGrowthChart?: boolean;
    showDebtorsCard?: boolean;
} = {}) {
    // Mirrors the real /analytics page:
    // - PageHeader with 1 action (Export PDF)
    // - Time range pill group
    // - 4 KPI cards (md:grid-cols-2, xl:grid-cols-4)
    // - Top chart row: revenue (col-span-2) + appointment status
    // - Bottom chart row: patient growth + top debtors
    // Heights are approximate but close enough that the page doesn't jump
    // when data arrives.
    const normalizedKpiCount = Math.max(0, Math.min(visibleKpiCount, 4));
    const kpiGridClass =
        normalizedKpiCount <= 1
            ? 'grid grid-cols-1 gap-4'
            : normalizedKpiCount === 2
                ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
                : normalizedKpiCount === 3
                    ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'
                    : 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4';
    const firstChartRowBoth = showRevenueChart && showStatusChart;
    const secondChartRowBoth = showGrowthChart && showDebtorsCard;

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
            {normalizedKpiCount > 0 ? (
                <div className={kpiGridClass}>
                {Array.from({ length: normalizedKpiCount }).map((_, index) => (
                    <Card key={index} className="rounded-2xl border-slate-200 bg-white shadow-sm">
                        <CardContent className="space-y-3 p-5" data-testid="analytics-kpi-skeleton">
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
            ) : null}
            {/* First chart row */}
            {showRevenueChart || showStatusChart ? (
                <div className={firstChartRowBoth ? 'grid grid-cols-1 gap-4 lg:grid-cols-3' : 'grid grid-cols-1 gap-4'}>
                    {showRevenueChart ? (
                        <Skeleton className={`h-[300px] rounded-2xl ${firstChartRowBoth ? 'lg:col-span-2' : ''}`} data-testid="analytics-revenue-chart-skeleton" />
                    ) : null}
                    {showStatusChart ? (
                        <Skeleton className="h-[300px] rounded-2xl" data-testid="analytics-status-chart-skeleton" />
                    ) : null}
                </div>
            ) : null}
            {/* Second chart row */}
            {showGrowthChart || showDebtorsCard ? (
                <div className={secondChartRowBoth ? 'grid grid-cols-1 gap-4 lg:grid-cols-2' : 'grid grid-cols-1 gap-4'}>
                    {showGrowthChart ? (
                        <Skeleton className="h-[280px] rounded-2xl" data-testid="analytics-growth-chart-skeleton" />
                    ) : null}
                    {showDebtorsCard ? (
                        <Skeleton className="h-[280px] rounded-2xl" data-testid="analytics-debtors-card-skeleton" />
                    ) : null}
                </div>
            ) : null}
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
