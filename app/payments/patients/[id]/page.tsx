'use client';

import { use, useMemo, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    BadgeDollarSign,
    CircleDollarSign,
    Download,
    Loader2,
    MapPin,
    Phone,
    ReceiptText,
    UserRound,
    Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { AccessDeniedState } from '@/components/error/access-denied-state';
import { AppErrorState } from '@/components/error/app-error-state';
import { useI18n } from '@/components/providers/i18n-provider';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DataTableShell, getDataTableClassName } from '@/components/ui/data-table-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionPanel } from '@/components/ui/page-shell';
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
import { buildPdfFilename, exportPatientReportToPdf } from '@/lib/export/pdf';
import { formatLocalizedDate } from '@/lib/i18n/date';
import {
    getProtectedMediaCrossOrigin,
    getProtectedMediaThumbnailUrl,
} from '@/lib/protected-media';
import { cn, formatCurrency } from '@/lib/utils';

const PAGE_SIZE = 10;
const EXPORT_PAGE_SIZE = 100;
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

function getPatientInitials(name: string): string {
    return name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');
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
        slate: {
            accent: 'from-slate-300 via-slate-400 to-slate-500',
            icon: 'from-slate-50 to-slate-100 text-slate-600 ring-slate-200/80 shadow-slate-100/50',
            value: 'text-slate-800',
        },
        emerald: {
            accent: 'from-emerald-400 via-teal-400 to-cyan-400',
            icon: 'from-emerald-50 to-teal-50 text-emerald-600 ring-emerald-100/80 shadow-emerald-100/50',
            value: 'text-emerald-700',
        },
        rose: {
            accent: 'from-amber-400 via-orange-400 to-rose-400',
            icon: 'from-amber-50 to-rose-50 text-rose-600 ring-rose-100/80 shadow-rose-100/50',
            value: 'text-rose-700',
        },
    } as const;
    const currencies = getVisibleCurrencies(balances);
    const styles = toneClasses[tone];

    return (
        <article className="group/card relative flex min-h-32 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40 transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/70">
            <div className={cn('absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r', styles.accent)} />
            <header className="flex items-center gap-2.5 px-4 pb-3 pt-4">
                <span className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ring-1 shadow-sm',
                    styles.icon
                )}>
                    <Icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">
                    {label}
                </span>
            </header>
            <div className="flex flex-1 flex-col justify-center border-t border-slate-100 bg-slate-50/35 px-4 py-3">
                <div className="space-y-1.5">
                    {currencies.map((currency) => {
                        const rawAmount = balances[currency][field];
                        const amount = field === 'balance' ? Math.max(0, rawAmount) : rawAmount;

                        return (
                            <div key={currency} className="flex flex-wrap items-center gap-2">
                                <span className={cn('text-lg font-bold tabular-nums', styles.value)}>
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
            </div>
        </article>
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
    const [isExporting, setIsExporting] = useState(false);

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
    const patientAvatarUrl = getProtectedMediaThumbnailUrl({
        scanStatus: patient.patient_photo_scan_status,
        thumbnailUrl: patient.patient_photo_thumbnail_url,
        thumbnailReady: patient.patient_photo_thumbnail_ready,
        previewUrl: patient.patient_photo_preview_url,
        previewReady: patient.patient_photo_preview_ready,
        url: patient.patient_photo_url,
        allowFullFallback: true,
    }) ?? undefined;

    const formatExportSummary = (field: 'totalDebt' | 'totalPaid' | 'balance') =>
        getVisibleCurrencies(balances)
            .map((currency) => {
                const rawAmount = balances[currency][field];
                if (field === 'balance' && rawAmount < 0) {
                    return `${formatCurrency(0, currency)} · ${t('patientHistory.balanceStatus.advance')}: ${formatCurrency(Math.abs(rawAmount), currency)}`;
                }

                return formatCurrency(rawAmount, currency);
            })
            .join(' / ');

    const handleExport = async () => {
        if ((patient.entry_count ?? 0) === 0) {
            toast.error(t('export.empty'));
            return;
        }

        setIsExporting(true);
        try {
            const exportEntries: ApiPaymentHistoryLedgerRow[] = [];
            let exportPage = 1;
            let exportTotalPages = 1;

            do {
                const response = await listPaymentLedgerHistory({
                    page: exportPage,
                    perPage: EXPORT_PAGE_SIZE,
                    filter: { patient_id: id },
                });
                exportEntries.push(...response.data);
                exportTotalPages = response.meta?.pagination?.total_pages ?? 1;
                exportPage += 1;
            } while (exportPage <= exportTotalPages);

            if (exportEntries.length === 0) {
                toast.error(t('export.empty'));
                return;
            }

            exportPatientReportToPdf({
                filename: buildPdfFilename('patient-payments'),
                title: t('payments.patientLedger.exportTitle'),
                locale,
                patientName: patient.patient_name,
                patientMeta: [
                    patient.patient_phone,
                    patient.patient_secondary_phone,
                    patient.patient_address,
                ].filter((value): value is string => Boolean(value?.trim())),
                summary: [
                    {
                        label: t('payments.patientLedger.table.price'),
                        value: formatExportSummary('totalDebt'),
                        tone: 'neutral',
                    },
                    {
                        label: t('payments.patientLedger.table.paid'),
                        value: formatExportSummary('totalPaid'),
                        tone: 'green',
                    },
                    {
                        label: t('payments.patientLedger.table.debt'),
                        value: formatExportSummary('balance'),
                        tone: 'red',
                    },
                ],
                sections: [{
                    title: t('payments.patientLedger.tableTitle'),
                    table: {
                        columns: [
                            t('patientHistory.table.date'),
                            t('payments.patientLedger.table.workTitle'),
                            t('payments.patientLedger.table.price'),
                            t('payments.patientLedger.table.paid'),
                            t('payments.patientLedger.table.debt'),
                        ],
                        rows: exportEntries.map((entry) => {
                            const currency: ApiMoneyCurrency = entry.currency === 'USD' ? 'USD' : 'UZS';
                            const remainingDebt = Math.max(0, Number(entry.balance_delta ?? 0));
                            const advance = Math.max(0, -Number(entry.balance_delta ?? 0));
                            const balanceLabel = advance > 0
                                ? `${formatCurrency(remainingDebt, currency)} · ${t('patientHistory.balanceStatus.advance')}: ${formatCurrency(advance, currency)}`
                                : formatCurrency(remainingDebt, currency);

                            return [
                                formatLedgerDate(entry.date, locale),
                                entry.work_done || '-',
                                formatCurrency(Number(entry.debt ?? 0), currency),
                                formatCurrency(Number(entry.paid ?? 0), currency),
                                balanceLabel,
                            ];
                        }),
                        emptyText: t('payments.patientLedger.empty'),
                    },
                }],
                orientation: 'landscape',
            });
            toast.success(t('export.downloaded'));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('payments.error.loadFailed')));
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-5">
            <section
                data-testid="payment-patient-basic-info"
                className="grid gap-3 rounded-2xl border border-white/80 bg-white p-4 shadow-sm shadow-slate-200/70 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)_auto] lg:items-center"
            >
                <div className="flex min-w-0 items-center gap-3">
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <Link href="/payments" aria-label={t('nav.payments')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <Avatar
                        data-testid="payment-patient-photo"
                        data-photo-src={patientAvatarUrl}
                        className="h-20 w-20 shrink-0 rounded-xl border border-white bg-slate-100 shadow-sm shadow-slate-200"
                    >
                        {patientAvatarUrl ? (
                            <AvatarImage
                                src={patientAvatarUrl}
                                alt={patient.patient_name}
                                className="rounded-xl object-cover"
                                crossOrigin={getProtectedMediaCrossOrigin(patientAvatarUrl)}
                            />
                        ) : null}
                        <AvatarFallback className="rounded-xl bg-slate-100 text-base font-semibold text-slate-700">
                            {getPatientInitials(patient.patient_name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-bold leading-tight tracking-[-0.02em] text-slate-950" title={patient.patient_name}>
                            {patient.patient_name}
                        </h1>
                        <p className="mt-1 text-sm text-slate-500">
                            {t('payments.patientLedger.subtitle')}
                        </p>
                    </div>
                </div>

                <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
                        icon={MapPin}
                        label={t('payments.patientLedger.address')}
                        value={patient.patient_address || '-'}
                    />
                    <PatientFact
                        icon={ReceiptText}
                        label={t('payments.patientLedger.entries')}
                        value={String(patient.entry_count ?? 0)}
                    />
                </div>

                <div className="flex justify-end">
                    {currentUserQuery.data?.subscription?.can_export ? (
                        <Button
                            variant="outline"
                            className="w-full sm:w-auto"
                            disabled={isExporting || (patient.entry_count ?? 0) === 0}
                            onClick={handleExport}
                        >
                            {isExporting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Download className="mr-2 h-4 w-4" />
                            )}
                            {t('common.export')}
                        </Button>
                    ) : null}
                </div>
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
