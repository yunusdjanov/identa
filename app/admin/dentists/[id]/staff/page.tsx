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
    ShieldCheck,
    UserCheck,
    Users,
} from 'lucide-react';

import { AdminHeader } from '@/components/admin/admin-header';
import { AppErrorState } from '@/components/error/app-error-state';
import { useI18n } from '@/components/providers/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTableShell, getDataTableClassName } from '@/components/ui/data-table-shell';
import { PageHeader, SectionPanel } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
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

function getStatusBadgeClassName(status: ApiAssistantAccount['account_status']): string {
    if (status === 'active') {
        return 'border-emerald-100 bg-emerald-50 text-emerald-700';
    }

    if (status === 'blocked') {
        return 'border-amber-100 bg-amber-50 text-amber-700';
    }

    return 'border-slate-200 bg-slate-100 text-slate-500';
}

function StaffPageSkeleton() {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader active="dashboard" onLogout={() => undefined} />
            <main className="p-3 sm:p-5 lg:p-6">
                <div className="mx-auto max-w-[1440px] space-y-5 lg:space-y-6">
                    <div className="rounded-[1.75rem] border border-white/80 bg-white/80 p-6">
                        <Skeleton className="h-10 w-72" />
                        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
                    </div>
                    <div className="grid gap-4 md:grid-cols-3">
                        {Array.from({ length: 3 }).map((_, index) => (
                            <Card key={index} className="rounded-[1.5rem] border-slate-200/80">
                                <CardContent className="p-5">
                                    <Skeleton className="h-4 w-28" />
                                    <Skeleton className="mt-5 h-8 w-16" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                    <SectionPanel className="space-y-4">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <Skeleton key={index} className="h-20 rounded-2xl" />
                        ))}
                    </SectionPanel>
                </div>
            </main>
        </div>
    );
}

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
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
        staleTime: 5 * 60_000,
    });

    const dentistQuery = useQuery({
        queryKey: ['admin', 'dentists', dentistId],
        queryFn: () => getAdminDentist(dentistId),
        enabled: authQuery.data?.role === 'admin' && dentistId !== '',
    });

    const staffQuery = useQuery({
        queryKey: ['admin', 'dentists', dentistId, 'staff'],
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
        return <StaffPageSkeleton />;
    }

    if (authQuery.data?.role !== 'admin') {
        return <StaffPageSkeleton />;
    }

    if (dentistQuery.isError || staffQuery.isError) {
        const error = dentistQuery.error ?? staffQuery.error;

        return (
            <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
                <AdminHeader active="dashboard" onLogout={handleLogout} />
                <main className="p-3 sm:p-5 lg:p-6">
                    <div className="mx-auto max-w-[1440px]">
                        <AppErrorState
                            title={t('common.loadErrorTitle')}
                            description={getApiErrorMessage(error, t('admin.staffDialog.loadFailed'))}
                            onRetry={() => {
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
        return <StaffPageSkeleton />;
    }

    const staffLimit = dentist.subscription?.staff_limit;
    const activeStaff = dentist.subscription?.active_staff_count ?? stats.active;
    const staffUsage = staffLimit
        ? `${activeStaff} / ${staffLimit}`
        : String(activeStaff);

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader active="dashboard" onLogout={handleLogout} />

            <main className="p-3 sm:p-5 lg:p-6">
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
                            <Button asChild variant="outline" className="h-11 rounded-2xl bg-white px-5">
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
                        <StaffStatCard
                            icon={<UserCheck className="h-4 w-4" />}
                            label={t('admin.staffPage.summary.active')}
                            value={stats.active}
                            description={t('admin.staffPage.summary.limit', { count: staffUsage })}
                            tone="green"
                        />
                        <StaffStatCard
                            icon={<Ban className="h-4 w-4" />}
                            label={t('admin.staffPage.summary.blocked')}
                            value={stats.blocked}
                            tone="amber"
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
                                className="border-blue-100 bg-blue-50/80 px-3 py-1 text-blue-700"
                            >
                                {t('admin.staffPage.summary.limit', { count: staffUsage })}
                            </Badge>
                        </div>

                        {staffMembers.length === 0 ? (
                            <div className="rounded-[1.5rem] border border-dashed border-blue-100 bg-blue-50/50 p-8 text-center">
                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm shadow-blue-100">
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
                                <DataTableShell className="hidden md:block">
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
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-slate-950">
                                                                {truncateForUi(staff.name, 34)}
                                                            </p>
                                                            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                                                <Mail className="h-3.5 w-3.5" />
                                                                {truncateForUi(staff.email, 36)}
                                                            </p>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-sm text-slate-600">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                                                            {staff.phone || t('admin.staffDialog.phoneFallback')}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className={getStatusBadgeClassName(staff.account_status)}
                                                        >
                                                            {t(`admin.status.${staff.account_status}`)}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                                                            <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                                                            {staff.assistant_permissions.length}
                                                        </span>
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
                                            className="rounded-[1.35rem] border border-slate-200/80 bg-white/95 p-4 shadow-sm shadow-slate-200/50"
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
                                                <span>
                                                    {t('admin.staffDialog.permissionCount', {
                                                        count: staff.assistant_permissions.length,
                                                    })}
                                                </span>
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
    tone: 'blue' | 'green' | 'amber';
}) {
    const toneClassName = {
        blue: 'border-blue-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(239,246,255,0.72)_100%)] text-blue-600',
        green: 'border-emerald-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(236,253,245,0.72)_100%)] text-emerald-600',
        amber: 'border-amber-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(255,251,235,0.72)_100%)] text-amber-600',
    }[tone];

    return (
        <Card className={cn('rounded-[1.5rem] shadow-sm shadow-slate-200/60', toneClassName)}>
            <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                    <p className="text-sm font-semibold text-slate-600">{label}</p>
                    <p className="mt-4 text-3xl font-black tracking-[-0.04em] text-slate-950">{value}</p>
                    {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
                </div>
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 shadow-sm shadow-slate-200/70">
                    {icon}
                </span>
            </CardContent>
        </Card>
    );
}
