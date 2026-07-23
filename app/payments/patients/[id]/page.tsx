'use client';

import { use, useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    BadgeDollarSign,
    CircleDollarSign,
    Hash,
    Phone,
    ReceiptText,
    UserRound,
    Wallet,
} from 'lucide-react';

import { AccessDeniedState } from '@/components/error/access-denied-state';
import { AppErrorState } from '@/components/error/app-error-state';
import { useI18n } from '@/components/providers/i18n-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DataTableShell, getDataTableClassName } from '@/components/ui/data-table-shell';
import { EmptyState } from '@/components/ui/empty-state';
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
    getCurrentUser,
    listPaymentLedgerHistory,
    listPaymentLedgerPatients,
} from '@/lib/api/dentist';
import type {
    ApiMoneyCurrency,
    ApiPaymentHistoryLedgerRow,
    ApiPaymentPatientLedgerRow,
} from '@/lib/api/types';
import { canView } from '@/lib/auth/permissions';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { cn, formatCurrency } from '@/lib/utils';

const PAGE_SIZE = 10;
const MONEY_CURRENCIES = ['UZS', 'USD'] as const satisfies readonly ApiMoneyCurrency[];

type PatientBalances = Record<ApiMoneyCurrency, {
    totalDebt: number;
    totalPaid: number;
    balance: number;
}>;

function getPatientBalances(row: ApiPaymentPatientLedgerRow): PatientBalances {
    const balances: PatientBalances = {
        UZS: { totalDebt: 0, totalPaid: 0, balance: 0 },
        USD: { totalDebt: 0, totalPaid: 0, balance: 0 },
    };

    for (const currency of MONEY_CURRENCIES) {
        const raw = row.balances_by_currency?.[currency];
        if (!raw) {
            continue;
        }

        balances[currency] = {
            totalDebt: Number(raw.total_debt ?? 0),
            totalPaid: Number(raw.total_paid ?? 0),
            balance: Number(raw.balance ?? 0),
        };
    }

    if (!row.balances_by_currency) {
        balances.UZS = {
            totalDebt: Number(row.total_debt ?? 0),
            totalPaid: Number(row.total_paid ?? 0),
            balance: Number(row.balance ?? 0),
        };
    }

    return balances;
}

function getVisibleCurrencies(balances: PatientBalances): readonly ApiMoneyCurrency[] {
    const visible = MONEY_CURRENCIES.filter((currency) => {
        const row = balances[currency];
        return row.totalDebt !== 0 || row.totalPaid !== 0 || row.balance !== 0;
    });

    return visible.length > 0 ? visible : ['UZS'];
}

function formatLedgerDate(value: string | null, locale: 'ru' | 'uz' | 'en') {
    if (!value) {
        return '-';
    }

    return formatLocalizedDate(value, locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function PatientFact({
    icon: Icon,
    label,
    value,
}: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    value: string;
}) {
    return (
        <div className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-teal-600 shadow-sm ring-1 ring-slate-100">
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                    {label}
                </span>
                <span className="block truncate text-sm font-semibold text-slate-800" title={value}>
                    {value}
                </span>
            </span>
        </div>
    );
}

function PaymentSummaryCard({
    icon: Icon,
    label,
    balances,
    field,
    tone,
}: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    balances: PatientBalances;
    field: 'totalDebt' | 'totalPaid' | 'balance';
    tone: 'slate' | 'emerald' | 'rose';
}) {
    const { t } = useI18n();
    const toneClasses = {
        slate: 'border-slate-200 bg-white text-slate-700',
        emerald: 'border-emerald-100 bg-emerald-50/40 text-emerald-700',
        rose: 'border-rose-100 bg-rose-50/40 text-rose-700',
    } as const;
    const currencies = getVisibleCurrencies(balances);

    return (
        <Card className={cn('gap-3 py-4', toneClasses[tone])}>
            <CardContent className="px-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em]">
                    <Icon className="h-4 w-4" />
                    {label}
                </div>
                <div className="space-y-1.5">
                    {currencies.map((currency) => {
                        const rawAmount = balances[currency][field];
                        const amount = field === 'balance' ? Math.max(0, rawAmount) : rawAmount;

                        return (
                            <div key={currency} className="flex flex-wrap items-center gap-2">
                                <span className="text-lg font-bold tabular-nums">
                                    {formatCurrency(amount, currency)}
                                </span>
                                {field === 'balance' && rawAmount < 0 ? (
                                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                        {t('patientHistory.balanceStatus.advance')}: {formatCurrency(Math.abs(rawAmount), currency)}
                                    </span>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}

function PaymentPatientLoadingState() {
    return (
        <div className="space-y-5" aria-label="Loading">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
            <div className="grid gap-3 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-28 rounded-2xl" />
                ))}
            </div>
            <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
    );
}

export default function PaymentPatientPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const { t, locale } = useI18n();
    const [page, setPage] = useState(1);

    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });
    const canViewPayments = canView(currentUserQuery.data, 'payments');

    const patientQuery = useQuery({
        queryKey: ['payments', 'ledger', 'patient', id],
        enabled: canViewPayments,
        retry: false,
        queryFn: () => listPaymentLedgerPatients({
            page: 1,
            perPage: 1,
            filter: { patient_id: id },
        }),
        staleTime: 30_000,
    });

    const ledgerQuery = useQuery({
        queryKey: ['payments', 'ledger', 'patient', id, 'entries', page],
        enabled: canViewPayments,
        retry: false,
        queryFn: () => listPaymentLedgerHistory({
            page,
            perPage: PAGE_SIZE,
            filter: { patient_id: id },
        }),
        placeholderData: (previousData) => previousData,
        staleTime: 30_000,
    });

    const totalPages = Math.max(1, ledgerQuery.data?.meta?.pagination?.total_pages ?? 1);

    const patient = patientQuery.data?.data[0];
    const balances = useMemo(
        () => patient ? getPatientBalances(patient) : null,
        [patient]
    );

    if (currentUserQuery.isLoading) {
        return <PaymentPatientLoadingState />;
    }

    if (currentUserQuery.isError) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(currentUserQuery.error, t('payments.error.loadFailed'))}
                retryLabel={t('common.retry')}
                onRetry={() => currentUserQuery.refetch()}
                backHref="/payments"
                backLabel={t('nav.payments')}
            />
        );
    }

    if (!canViewPayments) {
        return (
            <AccessDeniedState
                title={t('common.forbiddenTitle')}
                description={t('permissions.deniedDescription')}
                actionHref="/payments"
                actionLabel={t('nav.payments')}
            />
        );
    }

    if (patientQuery.isLoading || ledgerQuery.isLoading) {
        return <PaymentPatientLoadingState />;
    }

    if (patientQuery.isError || ledgerQuery.isError) {
        return (
            <AppErrorState
                title={t('common.loadErrorTitle')}
                description={getApiErrorMessage(
                    patientQuery.error || ledgerQuery.error,
                    t('payments.error.loadFailed')
                )}
                retryLabel={t('common.retry')}
                onRetry={() => {
                    patientQuery.refetch();
                    ledgerQuery.refetch();
                }}
                backHref="/payments"
                backLabel={t('nav.payments')}
            />
        );
    }

    if (!patient || !balances) {
        return (
            <SectionPanel>
                <EmptyState
                    icon={UserRound}
                    title={t('payments.patientLedger.notFound')}
                    action={(
                        <Button asChild variant="outline">
                            <Link href="/payments">{t('nav.payments')}</Link>
                        </Button>
                    )}
                />
            </SectionPanel>
        );
    }

    const entries = ledgerQuery.data?.data ?? [];
    const pagination = ledgerQuery.data?.meta?.pagination;
    const effectivePage = Math.min(pagination?.page ?? page, totalPages);

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow={patient.patient_code || undefined}
                title={patient.patient_name}
                description={t('payments.patientLedger.subtitle')}
                actions={(
                    <Button asChild variant="outline">
                        <Link href="/payments">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            {t('nav.payments')}
                        </Link>
                    </Button>
                )}
            />

            <section
                data-testid="payment-patient-basic-info"
                className="grid gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/60 sm:grid-cols-2 xl:grid-cols-4"
            >
                <PatientFact
                    icon={Hash}
                    label={t('payments.patientLedger.patientCode')}
                    value={patient.patient_code || '-'}
                />
                <PatientFact
                    icon={Phone}
                    label={t('payments.patientLedger.primaryPhone')}
                    value={patient.patient_phone || '-'}
                />
                <PatientFact
                    icon={Phone}
                    label={t('payments.patientLedger.secondaryPhone')}
                    value={patient.patient_secondary_phone || '-'}
                />
                <PatientFact
                    icon={ReceiptText}
                    label={t('payments.patientLedger.entries')}
                    value={String(patient.entry_count ?? 0)}
                />
            </section>

            <section className="grid gap-3 md:grid-cols-3">
                <PaymentSummaryCard
                    icon={CircleDollarSign}
                    label={t('payments.patientLedger.table.price')}
                    balances={balances}
                    field="totalDebt"
                    tone="slate"
                />
                <PaymentSummaryCard
                    icon={BadgeDollarSign}
                    label={t('payments.patientLedger.table.paid')}
                    balances={balances}
                    field="totalPaid"
                    tone="emerald"
                />
                <PaymentSummaryCard
                    icon={Wallet}
                    label={t('payments.patientLedger.table.debt')}
                    balances={balances}
                    field="balance"
                    tone="rose"
                />
            </section>

            <SectionPanel className="space-y-4">
                <div>
                    <h2 className="text-base font-bold text-slate-950 sm:text-lg">
                        {t('payments.patientLedger.tableTitle')}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                        {t('payments.patientLedger.tableDescription')}
                    </p>
                </div>

                {entries.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200">
                        <EmptyState
                            icon={ReceiptText}
                            title={t('payments.patientLedger.empty')}
                            size="sm"
                        />
                    </div>
                ) : (
                    <>
                        <DataTableShell>
                            <Table
                                aria-busy={ledgerQuery.isFetching}
                                className={cn(
                                    getDataTableClassName('standard'),
                                    'min-w-[680px] transition-opacity',
                                    ledgerQuery.isFetching ? 'opacity-60' : ''
                                )}
                            >
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t('patientHistory.table.date')}</TableHead>
                                        <TableHead>{t('payments.patientLedger.table.workTitle')}</TableHead>
                                        <TableHead>{t('payments.patientLedger.table.price')}</TableHead>
                                        <TableHead>{t('payments.patientLedger.table.paid')}</TableHead>
                                        <TableHead>{t('payments.patientLedger.table.debt')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {entries.map((entry: ApiPaymentHistoryLedgerRow) => {
                                        const currency: ApiMoneyCurrency = entry.currency === 'USD' ? 'USD' : 'UZS';
                                        const remainingDebt = Math.max(0, Number(entry.balance_delta ?? 0));
                                        const advance = Math.max(0, -Number(entry.balance_delta ?? 0));

                                        return (
                                            <TableRow key={entry.id}>
                                                <TableCell className="text-slate-600">
                                                    {formatLedgerDate(entry.date, locale)}
                                                </TableCell>
                                                <TableCell className="max-w-[22rem] whitespace-normal font-medium text-slate-900">
                                                    {entry.work_done || '-'}
                                                </TableCell>
                                                <TableCell className="font-medium tabular-nums text-slate-700">
                                                    {formatCurrency(Number(entry.debt ?? 0), currency)}
                                                </TableCell>
                                                <TableCell className="font-semibold tabular-nums text-emerald-700">
                                                    {formatCurrency(Number(entry.paid ?? 0), currency)}
                                                </TableCell>
                                                <TableCell className="tabular-nums">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={remainingDebt > 0 ? 'font-semibold text-rose-700' : 'text-slate-600'}>
                                                            {formatCurrency(remainingDebt, currency)}
                                                        </span>
                                                        {advance > 0 ? (
                                                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                                                {t('patientHistory.balanceStatus.advance')}: {formatCurrency(advance, currency)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </DataTableShell>

                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-slate-500">
                                {t('payments.pagination.pageOf', { page: effectivePage, total: totalPages })}
                            </p>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={effectivePage <= 1 || ledgerQuery.isFetching}
                                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                                >
                                    {t('common.previous')}
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={effectivePage >= totalPages || ledgerQuery.isFetching}
                                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                                >
                                    {t('common.next')}
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </SectionPanel>
        </div>
    );
}
