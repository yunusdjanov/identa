import type { ReactNode } from 'react';

import { Brand } from '@/components/branding/brand';
import { authCardClassName } from '@/components/auth/auth-form-styles';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function PageHeaderSkeleton({ actions = 1, eyebrow = false }: { actions?: number; eyebrow?: boolean }) {
    return (
        <section className="overflow-hidden rounded-[1.5rem] border border-white/80 bg-gradient-to-br from-white via-blue-50/55 to-white p-4 shadow-sm shadow-slate-200/70 sm:rounded-[1.75rem] sm:p-6">
            <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-2">
                    {eyebrow ? <Skeleton className="h-3 w-20 rounded-xl" /> : null}
                    <Skeleton className="h-9 w-48 rounded-xl sm:h-10 sm:w-64" />
                    <Skeleton className="h-4 w-64 max-w-full rounded-xl sm:w-96" />
                </div>
                {actions > 0 ? (
                    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                        {Array.from({ length: actions }).map((_, index) => (
                            <Skeleton key={index} className="h-10 w-full rounded-xl sm:w-36" />
                        ))}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

function MetricCardsSkeleton({ count = 3 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: count }).map((_, index) => (
                <Card
                    key={index}
                    data-testid="metric-card-skeleton"
                    className="rounded-[1.5rem] border-slate-200 bg-white/95 shadow-sm"
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
        <Card data-testid={testId} className="rounded-[1.5rem] border-slate-200 bg-white/95 shadow-sm">
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
                        className="grid gap-3 rounded-xl border border-slate-100 bg-white/80 p-3 md:border-0 md:bg-transparent md:p-0"
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

function ActivityPanelSkeleton() {
    return (
        <Card
            data-testid="activity-panel-skeleton"
            className="overflow-hidden rounded-[1.5rem] border-blue-100 bg-white/95 shadow-sm"
        >
            <CardHeader>
                <Skeleton className="h-3 w-36 rounded-xl" />
                <Skeleton className="h-7 w-48 rounded-xl" />
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <Skeleton className="h-7 w-16 rounded-full" />
                            <Skeleton className="h-5 w-20 rounded-full" />
                        </div>
                        <Skeleton className="h-4 w-full rounded-xl" />
                        <Skeleton className="mt-2 h-3 w-20 rounded-xl" />
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
        <header className="border-b border-blue-100/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,251,255,0.94)_100%)]">
            <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
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
            className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]"
        >
            <AdminHeaderSkeleton />
            <main className="p-3 sm:p-5 lg:p-6">
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
            <PageHeaderSkeleton actions={2} eyebrow />
            <MetricCardsSkeleton count={3} />
            <ActivityPanelSkeleton />
        </div>
    );
}

export function AppointmentsLoadingState() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={1} />
            <Card className="rounded-[1.5rem] border-blue-100/80 bg-white/95 shadow-sm">
                <CardContent className="space-y-4 p-3 sm:p-5">
                    <div className="flex flex-col gap-3 rounded-2xl border border-blue-100/80 bg-blue-50/30 p-3 md:flex-row md:items-center md:justify-between">
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
            <Card className="rounded-[1.5rem] border-slate-200 bg-white/95">
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
    return (
        <div data-testid="payments-loading" className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={0} />
            <MetricCardsSkeleton count={4} />
            <div className="flex gap-2">
                <Skeleton className="h-10 w-32 rounded-xl" />
                <Skeleton className="h-10 w-32 rounded-xl" />
            </div>
            <Card className="rounded-[1.5rem] border-slate-200 bg-white/95 shadow-sm">
                <CardContent className="p-4">
                    <Skeleton className="h-10 w-full rounded-xl" />
                </CardContent>
            </Card>
            <DataTableSkeleton columns={6} rows={7} testId="ledger-table-skeleton" />
        </div>
    );
}

export function SettingsLoadingState() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={0} />
            <TabStripSkeleton count={4} />
            <Card className="rounded-[1.5rem] border-slate-200 bg-white/95">
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
            <Card className="rounded-[1.5rem] border-blue-100 bg-white/95">
                <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-3">
                        <Skeleton className="h-4 w-28 rounded-xl" />
                        <Skeleton className="h-8 w-48 rounded-xl" />
                        <Skeleton className="h-4 w-64 rounded-xl" />
                    </div>
                    <Skeleton className="h-16 w-full rounded-xl sm:w-72" />
                </CardContent>
            </Card>
            <Skeleton className="h-11 w-full rounded-2xl sm:w-56" />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index} className="rounded-[1.5rem] border-slate-200 bg-white/95">
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
            <Card className="rounded-[1.5rem] border-slate-200 bg-white/95">
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
        <div className="space-y-5 lg:space-y-6">
            <section className="rounded-[1.75rem] border border-white/80 bg-gradient-to-br from-white via-blue-50/55 to-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex items-start gap-4">
                        <Skeleton className="h-10 w-10 rounded-xl" />
                        <Skeleton className="h-14 w-14 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-10 w-64 rounded-xl" />
                            <Skeleton className="h-5 w-40 rounded-xl" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Skeleton className="h-10 w-28 rounded-xl" />
                        <Skeleton className="h-10 w-28 rounded-xl" />
                    </div>
                </div>
            </section>
            <MetricCardsSkeleton count={3} />
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <DataTableSkeleton columns={3} rows={4} />
                <Card className="rounded-[1.5rem] border-slate-200 bg-white/95">
                    <CardHeader>
                        <Skeleton className="h-6 w-44 rounded-xl" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Skeleton className="h-20 w-full rounded-xl" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export function PatientHistoryLoadingState() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={1} />
            <Card className="rounded-[1.75rem] border-slate-200 bg-white/95">
                <CardHeader>
                    <Skeleton className="h-6 w-56 rounded-xl" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                        <Skeleton className="h-11 rounded-xl" />
                        <Skeleton className="h-11 rounded-xl" />
                        <Skeleton className="h-11 rounded-xl" />
                    </div>
                    <Skeleton className="h-[22rem] w-full rounded-2xl" />
                </CardContent>
            </Card>
        </div>
    );
}

export function OdontogramLoadingState() {
    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeaderSkeleton actions={1} />
            <Card className="rounded-[1.5rem] border-slate-200 bg-white/95">
                <CardHeader>
                    <Skeleton className="h-6 w-64 rounded-xl" />
                </CardHeader>
                <CardContent className="space-y-6 overflow-x-auto">
                    {Array.from({ length: 2 }).map((_, sectionIndex) => (
                        <div key={sectionIndex} className="space-y-3">
                            <Skeleton className="mx-auto h-4 w-24 rounded-xl" />
                            <div className="flex min-w-[36rem] justify-center gap-1">
                                {Array.from({ length: 16 }).map((__, toothIndex) => (
                                    <Skeleton key={toothIndex} className="h-14 w-10 rounded-lg" />
                                ))}
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

export function AdminDashboardLoadingState() {
    return (
        <AdminShellSkeleton>
            <PageHeaderSkeleton actions={0} />
            <MetricCardsSkeleton count={3} />
            <DataTableSkeleton columns={7} rows={6} />
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
        <AdminShellSkeleton maxWidth="max-w-5xl">
            <PageHeaderSkeleton actions={0} />
            <Card className="rounded-[1.5rem] border-slate-200 bg-white/95">
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
            <Card className="rounded-[1.5rem] border-slate-200 bg-white/95">
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

export function AdminLandingPanelSkeleton() {
    return (
        <Card
            data-testid="admin-landing-panel-skeleton"
            className="rounded-[1.5rem] border-slate-200 bg-white/95"
        >
            <CardHeader className="space-y-2">
                <Skeleton className="h-6 w-64 rounded-xl" />
                <Skeleton className="h-4 w-80 max-w-full rounded-xl" />
            </CardHeader>
            <CardContent className="space-y-5">
                <Skeleton className="h-12 w-full rounded-2xl" />
                <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-36 rounded-xl" />
                        <Skeleton className="h-10 w-full rounded-xl" />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Skeleton className="h-10 w-full rounded-xl sm:w-28" />
                </div>
            </CardContent>
        </Card>
    );
}

export function AdminLandingLoadingState() {
    return (
        <AdminShellSkeleton maxWidth="max-w-5xl">
            <PageHeaderSkeleton actions={0} />
            <AdminLandingPanelSkeleton />
        </AdminShellSkeleton>
    );
}

export function AdminLeadsPanelSkeleton() {
    return (
        <Card className="rounded-[1.5rem] border-slate-200 bg-white/95">
            <CardHeader className="space-y-2">
                <Skeleton className="h-6 w-48 rounded-xl" />
                <Skeleton className="h-4 w-80 max-w-full rounded-xl" />
            </CardHeader>
            <CardContent className="space-y-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-2">
                                <Skeleton className="h-5 w-48 rounded-xl" />
                                <Skeleton className="h-4 w-36 rounded-xl" />
                                <Skeleton className="h-4 w-56 rounded-xl" />
                                <Skeleton className="h-3 w-32 rounded-xl" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Skeleton className="h-9 w-20 rounded-xl" />
                                <Skeleton className="h-9 w-24 rounded-xl" />
                                <Skeleton className="h-9 w-20 rounded-xl" />
                            </div>
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

export function AdminLeadsLoadingState() {
    return (
        <AdminShellSkeleton maxWidth="max-w-5xl">
            <PageHeaderSkeleton actions={0} />
            <AdminLeadsPanelSkeleton />
        </AdminShellSkeleton>
    );
}

export function AdminPlansPanelSkeleton() {
    return <DataTableSkeleton columns={6} rows={4} />;
}

export function AdminDentistStaffLoadingState() {
    return (
        <AdminShellSkeleton maxWidth="max-w-5xl">
            <PageHeaderSkeleton actions={1} />
            <MetricCardsSkeleton count={2} />
            <DataTableSkeleton columns={5} rows={4} />
        </AdminShellSkeleton>
    );
}

export function AuthFormLoadingState({
    fieldCount,
    showOAuth = false,
}: {
    fieldCount: number;
    showOAuth?: boolean;
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
                                        <Skeleton className="h-9 w-40 rounded-full bg-white/80" />
                                    </div>
                                ) : null}
                                {Array.from({ length: fieldCount }).map((_, index) => (
                                    <div key={index} data-testid="auth-field-skeleton" className="space-y-2">
                                        <Skeleton className="h-4 w-24 rounded-xl" />
                                        <Skeleton className="h-10 w-full rounded-[1.1rem]" />
                                    </div>
                                ))}
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
