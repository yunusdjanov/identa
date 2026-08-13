'use client';

import { useEffect, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    Ban,
    Mail,
    Phone,
    UserCheck,
    Users,
} from 'lucide-react';

import { AdminHeader } from '@/components/admin/admin-header';
import { AdminDentistStaffLoadingState } from '@/components/layout/page-loading-skeletons';
import { AppErrorState } from '@/components/error/app-error-state';
import { useI18n } from '@/components/providers/i18n-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTableShell, getDataTableClassName } from '@/components/ui/data-table-shell';
import { PageHeader, SectionPanel } from '@/components/ui/page-shell';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { getApiErrorMessage } from '@/lib/api/client';
import {
    getAdminDentist,
    getCurrentUser,
    listAdminDentistStaff,
} from '@/lib/api/dentist';
import type { ApiAssistantAccount } from '@/lib/api/types';
import { useInstantLogout } from '@/lib/auth/use-instant-logout';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { cn, truncateForUi } from '@/lib/utils';
import { queryKeys } from '@/lib/query-keys';

function getStaffInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

function getStatusBadgeClassName(status: ApiAssistantAccount['account_status']): string {
    if (status === 'active') {
        return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    }

    if (status === 'blocked') {
        return 'border-amber-100 bg-amber-50 text-amber-700';
    }

    return 'border-slate-200 bg-slate-100 text-slate-500';
}

const STAFF_PERMISSION_LABEL_KEYS: Record<string, string> = {
    'patients.view': 'settings.team.permissionPatientsView',
    'patients.manage': 'settings.team.permissionPatientsManage',
    'appointments.view': 'settings.team.permissionAppointmentsView',
    'appointments.manage': 'settings.team.permissionAppointmentsManage',
    'payments.view': 'settings.team.permissionPaymentsView',
    'payments.manage': 'settings.team.permissionPaymentsManage',
};

function StaffPermissionBadges({
    permissions,
    t,
}: {
    permissions: string[];
    t: (key: string) => string;
}) {
    if (permissions.length === 0) {
        return <span className="text-sm text-slate-400">—</span>;
    }

    return (
        <div className="flex max-w-sm flex-wrap gap-1.5">
            {permissions.map((permission) => (
                <Badge
                    key={permission}
                    variant="outline"
                    className="border-teal-100 bg-teal-50 text-[10px] font-medium text-teal-800"
                >
                    {STAFF_PERMISSION_LABEL_KEYS[permission]
                        ? t(STAFF_PERMISSION_LABEL_KEYS[permission])
                        : permission}
                </Badge>
            ))}
        </div>
    );
}

// The inline `StaffPageSkeleton` was previously declared here, but it
// drifted from the real layout (different row shape and container width),
// producing a visible jump from the route-level skeleton → this inline one
// → the real layout. Importing the shared `AdminDentistStaffLoadingState`
// keeps the route-level and in-page shapes identical.

export default function AdminDentistStaffPage() {
    const { t, locale } = useI18n();
    const router = useRouter();
    const params = useParams();
    const handleLogout = useInstantLogout('/admin/login');
    const rawDentistId = params.id;
    const dentistId = Array.isArray(rawDentistId)
        ? rawDentistId[0]
        : String(rawDentistId ?? '');

    const authQuery = useQuery({
        queryKey: queryKeys.auth.me(),
        queryFn: getCurrentUser,
        retry: false,
        staleTime: 5 * 60_000,
    });

    const dentistQuery = useQuery({
        queryKey: queryKeys.admin.dentists.detail(dentistId),
        queryFn: () => getAdminDentist(dentistId),
        enabled: authQuery.data?.role === 'admin' && dentistId !== '',
    });

    const staffQuery = useQuery({
        queryKey: queryKeys.admin.dentists.staff(dentistId),
        queryFn: () => listAdminDentistStaff(dentistId),
        enabled: authQuery.data?.role === 'admin' && dentistId !== '',
        staleTime: 30_000,
    });

    useEffect(() => {
        if (authQuery.isError && !authQuery.isLoading) {
            router.replace('/admin/login');
            return;
        }

        if (authQuery.data && authQuery.data.role !== 'admin') {
            router.replace('/dashboard');
        }
    }, [authQuery.data, authQuery.isError, authQuery.isLoading, router]);

    const staffMembers = useMemo(() => staffQuery.data?.data ?? [], [staffQuery.data]);
    const stats = useMemo(() => {
        const active = staffMembers.filter((staff) => staff.account_status === 'active').length;
        const blocked = staffMembers.filter((staff) => staff.account_status === 'blocked').length;

        return {
            total: staffMembers.length,
            active,
            blocked,
        };
    }, [staffMembers]);

    if (
        authQuery.isLoading
        || (authQuery.data?.role === 'admin' && (dentistQuery.isLoading || staffQuery.isLoading))
    ) {
        return <AdminDentistStaffLoadingState />;
    }

    if (authQuery.data?.role !== 'admin') {
        return <AdminDentistStaffLoadingState />;
    }

    if (dentistQuery.isError || staffQuery.isError) {
        const error = dentistQuery.error ?? staffQuery.error;

        return (
            <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
                <AdminHeader active="dashboard" onLogout={handleLogout} />
                <main id="main-content" tabIndex={-1} className="px-3 py-3 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
                    <div className="mx-auto max-w-[1440px]">
                        <AppErrorState
                            title={t('common.loadErrorTitle')}
                            description={getApiErrorMessage(error, t('admin.staffDialog.loadFailed'))}
                            onRetry={() => {
                                // Refetch auth too — a 401 on dentist/staff
                                // queries usually means the admin session
                                // expired; refetching ['auth','me'] surfaces
                                // that and triggers the redirect-to-login
                                // useEffect rather than looping the same error.
                                void authQuery.refetch();
                                void dentistQuery.refetch();
                                void staffQuery.refetch();
                            }}
                            retryLabel={t('common.retry')}
                            backHref="/admin"
                            backLabel={t('admin.staffPage.back')}
                        />
                    </div>
                </main>
            </div>
        );
    }

    const dentist = dentistQuery.data;
    if (!dentist) {
        return <AdminDentistStaffLoadingState />;
    }

    const staffLimit = dentist.subscription?.staff_limit;
    const activeStaff = dentist.subscription?.active_staff_count ?? stats.active;
    const staffUsage = staffLimit
        ? `${activeStaff} / ${staffLimit}`
        : String(activeStaff);

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader active="dashboard" onLogout={handleLogout} />

            <main id="main-content" tabIndex={-1} className="px-3 py-3 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
                <div className="mx-auto max-w-[1440px] space-y-5 lg:space-y-6">
                    <PageHeader
                        title={t('admin.staffPage.title', { name: dentist.name })}
                        description={
                            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span>{t('admin.staffPage.subtitle')}</span>
                                <span className="text-slate-400">/</span>
                                <span>{dentist.email}</span>
                                {dentist.practice_name ? (
                                    <>
                                        <span className="text-slate-400">/</span>
                                        <span>{dentist.practice_name}</span>
                                    </>
                                ) : null}
                            </span>
                        }
                        actions={
                            <Button asChild variant="outline" className="h-10 rounded-2xl bg-white px-5">
                                <Link href="/admin">
                                    <ArrowLeft className="h-4 w-4" />
                                    {t('admin.staffPage.back')}
                                </Link>
                            </Button>
                        }
                    />

                    <div className="grid gap-4 md:grid-cols-3">
                        <StaffStatCard
                            icon={<Users className="h-4 w-4" />}
                            label={t('admin.staffPage.summary.total')}
                            value={stats.total}
                            tone="blue"
                        />
                        {/* Active count prefers `subscription.active_staff_count`
                            (backend's authoritative billing figure) over the
                            client-side filter — they should agree, but a stale
                            staff_limit downgrade can briefly disagree and we
                            want the billable number displayed. */}
                        <StaffStatCard
                            icon={<UserCheck className="h-4 w-4" />}
                            label={t('admin.staffPage.summary.active')}
                            value={activeStaff}
                            description={t('admin.staffPage.summary.limit', { count: staffUsage })}
                            tone="teal"
                        />
                        <StaffStatCard
                            icon={<Ban className="h-4 w-4" />}
                            label={t('admin.staffPage.summary.blocked')}
                            value={stats.blocked}
                            tone="red"
                        />
                    </div>

                    <SectionPanel className="space-y-5">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="text-lg font-bold tracking-[-0.02em] text-slate-950">
                                    {t('admin.viewStaff')}
                                </h2>
                                <p className="text-sm text-slate-500">
                                    {t('admin.staffPage.count', { count: stats.total })}
                                </p>
                            </div>
                            <Badge
                                variant="outline"
                                className="border-teal-100 bg-teal-50/80 px-3 py-1 text-teal-700"
                            >
                                {t('admin.staffPage.summary.limit', { count: staffUsage })}
                            </Badge>
                        </div>

                        {staffMembers.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-teal-100 bg-teal-50/50 p-8 text-center">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-teal-600 shadow-sm shadow-teal-100">
                                    <Users className="h-5 w-5" />
                                </div>
                                <h3 className="mt-4 text-base font-bold text-slate-950">
                                    {t('admin.staffPage.emptyTitle')}
                                </h3>
                                <p className="mt-2 text-sm text-slate-500">
                                    {t('admin.staffPage.emptyDescription')}
                                </p>
                            </div>
                        ) : (
                            <>
                                <DataTableShell
                                    aria-label={t('admin.staffPage.title')}
                                    className="hidden md:block"
                                >
                                    <Table className={getDataTableClassName('standard')}>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>{t('admin.staffPage.table.member')}</TableHead>
                                                <TableHead>{t('admin.staffPage.table.phone')}</TableHead>
                                                <TableHead>{t('admin.table.status')}</TableHead>
                                                <TableHead>{t('admin.staffPage.table.permissions')}</TableHead>
                                                <TableHead>{t('admin.table.lastLogin')}</TableHead>
                                                <TableHead>{t('admin.staffPage.table.created')}</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {staffMembers.map((staff) => (
                                                <TableRow key={staff.id}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <Avatar>
                                                                {staff.avatar_url ? (
                                                                    /* Avatar URL comes from user input on the dentist side
                                                                       (and may eventually be admin-uploaded). Without a
                                                                       referrer policy a malicious host can capture admin
                                                                       session URLs; `no-referrer` blocks that leak. The
                                                                       fallback initials render automatically if the load
                                                                       errors out. */
                                                                    <AvatarImage
                                                                        src={staff.avatar_url}
                                                                        alt={staff.name}
                                                                        referrerPolicy="no-referrer"
                                                                    />
                                                                ) : null}
                                                                <AvatarFallback className="bg-teal-50 text-teal-700 font-semibold">
                                                                    {getStaffInitials(staff.name)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="min-w-0">
                                                                <p className="font-semibold text-slate-950 truncate">
                                                                    {truncateForUi(staff.name, 34)}
                                                                </p>
                                                                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                                                    <Mail className="h-3.5 w-3.5 shrink-0" />
                                                                    <span className="truncate">{truncateForUi(staff.email, 36)}</span>
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-sm text-slate-600">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                                                            {staff.phone || t('admin.staffDialog.phoneFallback')}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col items-start gap-1.5">
                                                            <Badge
                                                                variant="outline"
                                                                className={getStatusBadgeClassName(staff.account_status)}
                                                            >
                                                                {t(`admin.status.${staff.account_status}`)}
                                                            </Badge>
                                                            {staff.must_change_password ? (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="border-amber-200 bg-amber-50 text-[10px] text-amber-800"
                                                                >
                                                                    {t('admin.staffPage.passwordResetRequired')}
                                                                </Badge>
                                                            ) : null}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <StaffPermissionBadges
                                                            permissions={staff.assistant_permissions}
                                                            t={t}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-sm text-slate-600">
                                                        {staff.last_login_at
                                                            ? formatLocalizedDate(staff.last_login_at, locale, {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric',
                                                            })
                                                            : t('admin.staffDialog.neverLoggedIn')}
                                                    </TableCell>
                                                    <TableCell className="text-sm text-slate-600">
                                                        {staff.created_at
                                                            ? formatLocalizedDate(staff.created_at, locale, {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric',
                                                            })
                                                            : '-'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </DataTableShell>

                                <div className="grid gap-3 md:hidden">
                                    {staffMembers.map((staff) => (
                                        <article
                                            key={staff.id}
                                            className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/50"
                                        >
                                            <div className="flex min-w-0 items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="truncate text-sm font-bold text-slate-950">
                                                        {staff.name}
                                                    </h3>
                                                    <p className="mt-1 truncate text-sm text-slate-500">
                                                        {staff.email}
                                                    </p>
                                                </div>
                                                <Badge
                                                    variant="outline"
                                                    className={getStatusBadgeClassName(staff.account_status)}
                                                >
                                                    {t(`admin.status.${staff.account_status}`)}
                                                </Badge>
                                            </div>
                                            <div className="mt-4 grid gap-2 text-xs text-slate-500">
                                                <span>{staff.phone || t('admin.staffDialog.phoneFallback')}</span>
                                                {staff.must_change_password ? (
                                                    <Badge
                                                        variant="outline"
                                                        className="w-fit border-amber-200 bg-amber-50 text-[10px] text-amber-800"
                                                    >
                                                        {t('admin.staffPage.passwordResetRequired')}
                                                    </Badge>
                                                ) : null}
                                                <StaffPermissionBadges
                                                    permissions={staff.assistant_permissions}
                                                    t={t}
                                                />
                                                <span>
                                                    {staff.last_login_at
                                                        ? t('admin.staffDialog.lastLogin', {
                                                            date: formatLocalizedDate(staff.last_login_at, locale, {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric',
                                                            }),
                                                        })
                                                        : t('admin.staffDialog.neverLoggedIn')}
                                                </span>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            </>
                        )}
                    </SectionPanel>
                </div>
            </main>
        </div>
    );
}

function StaffStatCard({
    icon,
    label,
    value,
    description,
    tone,
}: {
    icon: ReactNode;
    label: string;
    value: number;
    description?: string;
    tone: 'blue' | 'teal' | 'green' | 'amber' | 'red';
}) {
    const toneClassName = {
        blue: 'border-blue-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(219,234,254,0.72)_100%)] text-blue-600',
        teal: 'border-teal-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(204,251,241,0.72)_100%)] text-teal-600',
        green: 'border-emerald-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(236,253,245,0.72)_100%)] text-emerald-600',
        amber: 'border-amber-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(255,251,235,0.72)_100%)] text-amber-600',
        red: 'border-red-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(254,226,226,0.72)_100%)] text-red-600',
    }[tone];

    return (
        <Card className={cn('rounded-2xl shadow-sm shadow-slate-200/60', toneClassName)}>
            <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                    <p className="text-sm font-semibold text-slate-600">{label}</p>
                    <p className="mt-3 text-2xl font-bold tracking-[-0.03em] text-slate-950">{value}</p>
                    {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm shadow-slate-200/70">
                    {icon}
                </span>
            </CardContent>
        </Card>
    );
}
