'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    BadgeCheck,
    Clock,
    CheckCircle2,
    DollarSign,
    Loader2,
    Receipt,
    RotateCcw,
    Search,
    Wallet,
    XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { AdminHeader } from '@/components/admin/admin-header';
import { AdminPaymentsLoadingState } from '@/components/layout/page-loading-skeletons';
import { AppErrorState } from '@/components/error/app-error-state';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { DataTableShell, getDataTableClassName } from '@/components/ui/data-table-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

import { useI18n } from '@/components/providers/i18n-provider';
import { useInstantLogout } from '@/lib/auth/use-instant-logout';
import { getApiErrorMessage } from '@/lib/api/client';
import {
    getCurrentUser,
    listAdminPayments,
    refundAdminPayment,
} from '@/lib/api/dentist';
import type { ApiAdminPayment } from '@/lib/api/types';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { truncateForUi } from '@/lib/utils';

const PAYMENTS_PER_PAGE = 20;

type PaymentStatusFilter = 'all' | 'paid' | 'pending' | 'failed' | 'canceled' | 'refunded';

function formatAmount(amount: number, currency: string, locale: string): string {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency || 'UZS',
        maximumFractionDigits: 0,
    }).format(amount);
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

function getStatusBadgeClasses(status: ApiAdminPayment['status']): string {
    switch (status) {
        case 'paid':
            return 'border-emerald-100 bg-emerald-50 text-emerald-700';
        case 'pending':
            return 'border-amber-100 bg-amber-50 text-amber-700';
        case 'failed':
            return 'border-red-100 bg-red-50 text-red-700';
        case 'refunded':
            return 'border-blue-100 bg-blue-50 text-blue-700';
        case 'canceled':
        default:
            return 'border-slate-200 bg-slate-100 text-slate-600';
    }
}

function getStatusIcon(status: ApiAdminPayment['status']): {
    Icon: LucideIcon;
    className: string;
} {
    switch (status) {
        case 'paid':
            return { Icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600' };
        case 'pending':
            return { Icon: Clock, className: 'bg-amber-50 text-amber-600' };
        case 'failed':
            return { Icon: XCircle, className: 'bg-red-50 text-red-600' };
        case 'refunded':
            return { Icon: RotateCcw, className: 'bg-blue-50 text-blue-600' };
        case 'canceled':
        default:
            return { Icon: XCircle, className: 'bg-slate-100 text-slate-500' };
    }
}

function getBillingPeriodLabel(
    period: string | null | undefined,
    t: (key: string, vars?: Record<string, string | number>) => string
): string {
    if (!period) return '-';
    if (period === 'trial' || period === 'monthly' || period === 'yearly') {
        return t(`subscription.plan.${period}`);
    }
    return period;
}

export default function AdminPaymentsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { locale, t } = useI18n();
    const handleLogout = useInstantLogout('/login');

    const [searchInput, setSearchInput] = useState('');
    const [statusFilter, setStatusFilter] = useState<PaymentStatusFilter>('all');
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const [page, setPage] = useState(1);
    const [refundTarget, setRefundTarget] = useState<ApiAdminPayment | null>(null);

    const search = useDebouncedValue(searchInput, 300);

    const authQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        retry: false,
    });

    useEffect(() => {
        if (authQuery.isError && !authQuery.isLoading) {
            router.replace('/login');
            return;
        }
        if (authQuery.data && authQuery.data.role !== 'admin') {
            router.replace('/');
        }
    }, [authQuery.isError, authQuery.isLoading, authQuery.data, router]);

    // Reset to the first page whenever a filter changes. Done during render
    // (React's "adjust state when a value changes" pattern) rather than in an
    // effect so the page snaps back before paint and we avoid a cascading
    // render — see https://react.dev/learn/you-might-not-need-an-effect.
    const filterKey = `${search}|${statusFilter}|${dateFrom}|${dateTo}`;
    const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
    if (prevFilterKey !== filterKey) {
        setPrevFilterKey(filterKey);
        setPage(1);
    }

    const paymentsQuery = useQuery({
        queryKey: ['admin', 'payments', page, search, statusFilter, dateFrom, dateTo],
        queryFn: () =>
            listAdminPayments({
                page,
                perPage: PAYMENTS_PER_PAGE,
                filter: {
                    search: search.trim() || undefined,
                    status: statusFilter === 'all' ? undefined : statusFilter,
                    from: dateFrom || undefined,
                    to: dateTo || undefined,
                },
            }),
        enabled: authQuery.data?.role === 'admin',
        placeholderData: (previous) => previous,
    });

    const refundMutation = useMutation({
        mutationFn: (id: string) => refundAdminPayment(id),
        onSuccess: () => {
            toast.success(t('admin.payments.toast.refunded'));
            setRefundTarget(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'dentists'] });
            // Refund cascade may have flipped a dentist's subscription to
            // read_only and written audit entries — refresh the per-dentist
            // billing cache (used by the detail page) and the audit log.
            queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
            if (refundTarget?.dentist?.id) {
                queryClient.invalidateQueries({
                    queryKey: ['admin', 'dentists', refundTarget.dentist.id, 'billing'],
                });
            }
            // The dentist's own billing portal (own queries) may still display
            // the pre-refund state from their last visit. The dentist's
            // current-subscription/payments queries refetch on focus + the
            // 60s heartbeat, but in-app navigation may show stale data. Cross-
            // user invalidation isn't possible from this React Query client,
            // so we rely on the dentist's own staleTime/refetch policy.
        },
        onError: (error) => {
            toast.error(getApiErrorMessage(error, t('admin.payments.error.refundFailed')));
        },
    });

    // Track which row's refund is in flight so the per-row spinner only fires
    // on the specific button the admin clicked.
    const refundingPaymentId = refundMutation.isPending ? refundMutation.variables ?? null : null;

    const payments = paymentsQuery.data?.data ?? [];
    const summary = paymentsQuery.data?.meta.summary;
    const pagination = paymentsQuery.data?.meta.pagination;

    const totalPages = pagination?.total_pages ?? 1;

    const statusOptions: Array<{ value: PaymentStatusFilter; key: string }> = useMemo(
        () => [
            { value: 'all', key: 'admin.payments.filter.all' },
            { value: 'paid', key: 'admin.billing.payment.status.paid' },
            { value: 'pending', key: 'admin.billing.payment.status.pending' },
            { value: 'failed', key: 'admin.billing.payment.status.failed' },
            { value: 'refunded', key: 'admin.billing.payment.status.refunded' },
            { value: 'canceled', key: 'admin.billing.payment.status.canceled' },
        ],
        []
    );

    // While the auth-me query is in flight we render the same skeleton the
    // Next.js loading.tsx route shows (header + 3 summary cards + filters +
    // table) so the layout doesn't jump once auth resolves. Previously we
    // showed an h-12 strip + 3 plain boxes + a single h-64 placeholder,
    // which had different dimensions than the real page and caused a visible
    // relayout flash.
    if (authQuery.isLoading || !authQuery.data) {
        return <AdminPaymentsLoadingState />;
    }

    if (authQuery.data.role !== 'admin') {
        return null;
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,0.55),transparent_34rem),linear-gradient(180deg,#f8fbff_0%,#f8fafc_42%,#f1f5f9_100%)]">
            <AdminHeader active="payments" onLogout={handleLogout} />

            <main className="mx-auto max-w-[1440px] space-y-5 px-3 py-6 sm:px-6 sm:py-8 lg:space-y-6 lg:px-8">
                <PageHeader title={t('admin.paymentsTitle')} description={t('admin.paymentsSubtitle')} />

                {/* Summary cards (gray → blue → teal accent progression) */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Card className="border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(241,245,249,0.7)_100%)] shadow-sm shadow-slate-200/60">
                        <CardContent className="flex items-center justify-between gap-3 p-5">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-600">
                                    {t('admin.payments.thisMonth')}
                                </p>
                                <p className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-950">
                                    {summary
                                        ? formatAmount(summary.this_month, summary.currency, locale)
                                        : '—'}
                                </p>
                            </div>
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-600 shadow-sm shadow-slate-200/70">
                                <Wallet className="h-5 w-5" />
                            </span>
                        </CardContent>
                    </Card>

                    <Card className="border-blue-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(219,234,254,0.6)_100%)] shadow-sm shadow-blue-100/40">
                        <CardContent className="flex items-center justify-between gap-3 p-5">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-600">
                                    {t('admin.payments.thisYear')}
                                </p>
                                <p className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-950">
                                    {summary
                                        ? formatAmount(summary.this_year, summary.currency, locale)
                                        : '—'}
                                </p>
                            </div>
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm shadow-blue-100/70">
                                <DollarSign className="h-5 w-5" />
                            </span>
                        </CardContent>
                    </Card>

                    <Card className="border-teal-100 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(204,251,241,0.6)_100%)] shadow-sm shadow-teal-100/40">
                        <CardContent className="flex items-center justify-between gap-3 p-5">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-600">
                                    {t('admin.payments.total')}
                                </p>
                                <p className="mt-2 text-2xl font-bold tracking-[-0.03em] text-slate-950">
                                    {summary
                                        ? formatAmount(summary.all_time, summary.currency, locale)
                                        : '—'}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {summary
                                        ? t('admin.payments.paidCount', { count: summary.paid_count })
                                        : ''}
                                </p>
                            </div>
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-600 shadow-sm shadow-teal-100/70">
                                <BadgeCheck className="h-5 w-5" />
                            </span>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters + Payments table */}
                <Card className="overflow-hidden rounded-2xl bg-white">
                    <div className="border-b border-slate-200/70 p-5 sm:p-6">
                        {/* Single horizontal filter bar — From/To/Status/Search.
                            On mobile (< lg) stacks; on lg+ stays inline so admin
                            can scan all controls at a glance. */}
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
                            <div className="flex items-center gap-2">
                                <label htmlFor="payments-date-from" className="text-xs font-medium text-slate-600">
                                    {t('admin.payments.filter.dateFrom')}
                                </label>
                                <Input
                                    id="payments-date-from"
                                    type="date"
                                    value={dateFrom}
                                    onChange={(event) => setDateFrom(event.target.value)}
                                    className="h-10 w-auto rounded-xl border-slate-200 bg-white shadow-xs"
                                    max={dateTo || undefined}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <label htmlFor="payments-date-to" className="text-xs font-medium text-slate-600">
                                    {t('admin.payments.filter.dateTo')}
                                </label>
                                <Input
                                    id="payments-date-to"
                                    type="date"
                                    value={dateTo}
                                    onChange={(event) => setDateTo(event.target.value)}
                                    className="h-10 w-auto rounded-xl border-slate-200 bg-white shadow-xs"
                                    min={dateFrom || undefined}
                                />
                            </div>
                            {(dateFrom || dateTo) ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDateFrom('');
                                        setDateTo('');
                                    }}
                                    className="text-xs font-medium text-slate-500 transition hover:text-slate-900"
                                >
                                    {t('admin.payments.filter.dateClear')}
                                </button>
                            ) : null}
                            <Select
                                value={statusFilter}
                                onValueChange={(value) => setStatusFilter(value as PaymentStatusFilter)}
                            >
                                <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-white shadow-xs lg:ml-auto lg:w-48">
                                    <SelectValue placeholder={t('admin.payments.filter.all')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {statusOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {t(option.key)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <div className="relative w-full lg:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder={t('admin.payments.searchPlaceholder')}
                                    value={searchInput}
                                    onChange={(event) => setSearchInput(event.target.value)}
                                    className="h-10 rounded-xl border-slate-200 bg-white pl-10 shadow-xs"
                                    maxLength={120}
                                />
                            </div>
                        </div>
                    </div>

                    <CardContent className="px-4 pb-5 sm:px-5">
                        {paymentsQuery.isLoading ? (
                            // Row-shaped skeleton (6 cols, 8 rows) mirrors the
                            // real table layout so pagination clicks don't
                            // collapse the table card into a single grey block.
                            // The h-64 placeholder we had before triggered a
                            // ~200px height jump every time the user paged.
                            <div className="space-y-2.5">
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
                            </div>
                        ) : paymentsQuery.isError ? (
                            <AppErrorState
                                title={t('common.loadErrorTitle')}
                                description={getApiErrorMessage(
                                    paymentsQuery.error,
                                    t('admin.payments.error.loadFailed')
                                )}
                                retryLabel={t('common.retry')}
                                onRetry={() => paymentsQuery.refetch()}
                                className="min-h-[16rem] px-0 py-0"
                            />
                        ) : payments.length === 0 ? (
                            <EmptyState
                                icon={Receipt}
                                title={t('admin.payments.empty')}
                                size="md"
                            />
                        ) : (
                            <DataTableShell>
                                <Table className={getDataTableClassName('standard')}>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t('admin.payments.table.date')}</TableHead>
                                            <TableHead>{t('admin.payments.table.dentist')}</TableHead>
                                            <TableHead>{t('admin.payments.table.plan')}</TableHead>
                                            <TableHead className="text-right">
                                                {t('admin.payments.table.amount')}
                                            </TableHead>
                                            <TableHead>{t('admin.payments.table.status')}</TableHead>
                                            {/* Width [1%] + whitespace-nowrap makes the column shrink to
                                                the button's actual width, so Status content sits visually
                                                next to Actions instead of stretching across a wide gap. */}
                                            <TableHead className="w-[1%] whitespace-nowrap text-right">
                                                {t('admin.payments.table.actions')}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {payments.map((payment) => {
                                            const { Icon: StatusIcon, className: statusIconClass } =
                                                getStatusIcon(payment.status);
                                            const dateValue = payment.paid_at ?? payment.created_at;
                                            return (
                                                <TableRow key={payment.id} className="hover:bg-slate-50/70">
                                                    <TableCell className="whitespace-nowrap text-sm text-slate-700 tabular-nums">
                                                        {dateValue
                                                            ? formatLocalizedDate(dateValue, locale, {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric',
                                                            })
                                                            : '—'}
                                                    </TableCell>
                                                    <TableCell className="max-w-[18rem]">
                                                        {payment.dentist ? (
                                                            <Link
                                                                href={`/admin/dentists/${payment.dentist.id}/billing`}
                                                                className="flex items-center gap-2.5 min-w-0 transition hover:opacity-80"
                                                            >
                                                                <Avatar>
                                                                    {payment.dentist.avatar_url ? (
                                                                        <AvatarImage
                                                                            src={payment.dentist.avatar_url}
                                                                            alt={payment.dentist.name}
                                                                        />
                                                                    ) : null}
                                                                    <AvatarFallback className="bg-teal-50 text-teal-700 font-semibold">
                                                                        {getInitials(payment.dentist.name)}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <div className="min-w-0">
                                                                    <p className="truncate text-sm font-semibold text-slate-900">
                                                                        {t('common.doctorPrefix')}{' '}
                                                                        {truncateForUi(payment.dentist.name, 26)}
                                                                    </p>
                                                                    <p className="truncate text-xs text-slate-500">
                                                                        {truncateForUi(payment.dentist.email, 32)}
                                                                    </p>
                                                                </div>
                                                            </Link>
                                                        ) : (
                                                            <span className="text-sm text-slate-400">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        <p className="text-sm font-medium text-slate-900">
                                                            {payment.plan_name}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            {getBillingPeriodLabel(payment.billing_period, t)}
                                                        </p>
                                                    </TableCell>
                                                    <TableCell className="text-right font-semibold tabular-nums text-slate-900">
                                                        {formatAmount(payment.amount, payment.currency, locale)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <span
                                                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${statusIconClass}`}
                                                            >
                                                                <StatusIcon className="h-3.5 w-3.5" />
                                                            </span>
                                                            <Badge
                                                                variant="outline"
                                                                className={getStatusBadgeClasses(payment.status)}
                                                            >
                                                                {t(`admin.billing.payment.status.${payment.status}`)}
                                                            </Badge>
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="w-[1%] whitespace-nowrap text-right">
                                                        {payment.status === 'paid' ? (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="h-8 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                                                                onClick={() => setRefundTarget(payment)}
                                                                disabled={refundMutation.isPending}
                                                            >
                                                                {refundingPaymentId === payment.id ? (
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                ) : (
                                                                    <RotateCcw className="h-3.5 w-3.5" />
                                                                )}
                                                                <span className="ml-1.5 hidden sm:inline">
                                                                    {t('admin.payments.refund')}
                                                                </span>
                                                            </Button>
                                                        ) : (
                                                            <span className="text-xs text-slate-400">—</span>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </DataTableShell>
                        )}
                    </CardContent>

                    {pagination && totalPages > 1 ? (
                        <div className="flex items-center justify-between border-t border-slate-200/70 px-4 py-3 sm:px-5">
                            <p className="text-xs text-slate-500">
                                {t('admin.payments.pagination', {
                                    page,
                                    total: totalPages,
                                })}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                >
                                    {t('common.previous')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                >
                                    {t('common.next')}
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </Card>
            </main>

            <ConfirmActionDialog
                open={refundTarget !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setRefundTarget(null);
                    }
                }}
                title={t('admin.payments.refundConfirmTitle')}
                description={
                    refundTarget
                        ? t('admin.payments.refundConfirmDescription', {
                            amount: formatAmount(
                                refundTarget.amount,
                                refundTarget.currency,
                                locale
                            ),
                            dentist: refundTarget.dentist?.name ?? '—',
                        })
                        : ''
                }
                confirmLabel={t('admin.payments.refund')}
                pendingLabel={t('admin.payments.refundPending')}
                cancelLabel={t('common.cancel')}
                isPending={refundMutation.isPending}
                onConfirm={() => {
                    if (!refundTarget) {
                        return;
                    }
                    refundMutation.mutate(refundTarget.id);
                }}
            />
        </div>
    );
}
