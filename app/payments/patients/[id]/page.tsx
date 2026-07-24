'use client';

import { use, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    BadgeDollarSign,
    CalendarDays,
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
import { Badge } from '@/components/ui/badge';
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
    title,
    tone = 'teal',
}: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    value: ReactNode;
    title?: string;
    tone?: 'teal' | 'sky' | 'slate';
}) {
    const tones = {
        teal: 'bg-teal-50 text-teal-600 ring-teal-100',
        sky: 'bg-sky-50 text-sky-600 ring-sky-100',
        slate: 'bg-slate-100 text-slate-500 ring-slate-200/80',
    } as const;

    return (
        <div className="flex h-11 min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-white/80 bg-white/75 px-2.5 py-1.5">
            <span className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1',
                tones[tone]
            )} title={label}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">{label}</span>
            </span>
            <span
                className="min-w-0 overflow-hidden truncate text-[12px] font-semibold leading-5 text-slate-900"
                title={title}
            >
                {value}
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
    hint,
}: {
    icon: ComponentType<{ className?: string }>;
    label: string;
    balances: PatientBalances;
    field: 'totalDebt' | 'totalPaid' | 'balance';
    tone: 'red' | 'emerald' | 'amber';
    hint: string;
}) {
    const { t } = useI18n();
    const toneClasses = {
        red: {
            root: 'metric-hover-red border-red-100 bg-gradient-to-br from-white via-rose-50/70 to-red-50 shadow-red-100/60',
            label: 'text-slate-700',
            icon: 'text-red-500',
            value: 'text-red-700',
            hint: 'text-slate-500',
        },
        emerald: {
            root: 'metric-hover-emerald border-emerald-100 bg-gradient-to-br from-white via-emerald-50/70 to-teal-50 shadow-emerald-100/60',
            label: 'text-slate-700',
            icon: 'text-emerald-600',
            value: 'text-emerald-700',
            hint: 'text-slate-500',
        },
        amber: {
            root: 'metric-hover-amber border-amber-100 bg-gradient-to-br from-white via-amber-50/75 to-orange-50 shadow-amber-100/60',
            label: 'text-orange-700',
            icon: 'text-orange-500',
            value: 'text-orange-700',
            hint: 'text-orange-600/80',
        },
    } as const;
    const currencies = getVisibleCurrencies(balances);
    const styles = toneClasses[tone];

    return (
        <article className={cn(
            'interactive-card metric-hover-card flex min-h-36 flex-col rounded-2xl border p-4 shadow-sm md:p-5',
            styles.root
        )}>
            <header className={cn('flex flex-wrap items-center gap-2 text-sm font-medium', styles.label)}>
                <Icon className={cn('h-4 w-4', styles.icon)} />
                <span>
                    {label}
                </span>
            </header>
            <div className="mt-2 flex flex-1 flex-col justify-center">
                <div className="space-y-1.5">
                    {currencies.map((currency) => {
                        const rawAmount = balances[currency][field];
                        const amount = field === 'balance' ? Math.abs(rawAmount) : rawAmount;

                        return (
                            <div key={currency} className="flex flex-wrap items-center gap-2">
                                <span className={cn('text-xl font-semibold leading-none tabular-nums', styles.value)}>
                                    {formatCurrency(amount, currency)}
                                </span>
                                {field === 'balance' && rawAmount < 0 ? (
                                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                        {t('patientHistory.balanceStatus.advance')}: {formatCurrency(Math.abs(rawAmount), currency)}
                                    </span>
                                ) : field === 'balance' && rawAmount > 0 ? (
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                        {t('patientHistory.balanceStatus.debt')}
                                    </span>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            </div>
            <p className={cn('mt-2 text-xs', styles.hint)}>{hint}</p>
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
        <div className="space-y-2.5">
            <section
                data-testid="payment-patient-basic-info"
                className="grid grid-cols-1 gap-2.5 rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-sm shadow-slate-200/70 sm:px-5 lg:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)] lg:items-center xl:grid-cols-[minmax(18rem,20rem)_minmax(0,1fr)_auto]"
            >
                <div
                    data-testid="payment-patient-header-identity"
                    className="flex w-full min-w-0 max-w-[20rem] items-center gap-3"
                >
                    <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <Link href="/payments" aria-label={t('nav.payments')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div className="relative h-20 w-24 shrink-0 overflow-visible">
                        <Avatar
                            data-testid="payment-patient-photo"
                            data-photo-src={patientAvatarUrl}
                            className="absolute left-0 top-1/2 h-24 w-24 -translate-y-1/2 rounded-xl border border-white bg-slate-100 shadow-sm shadow-slate-200"
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
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-lg font-bold leading-tight tracking-[-0.02em] text-slate-950" title={patient.patient_name}>
                            {patient.patient_name}
                        </h1>
                        <Badge variant="secondary" className="mt-2 max-w-full truncate bg-slate-100 text-xs text-slate-600">
                            {t('nav.payments')}
                        </Badge>
                    </div>
                </div>

                <div
                    data-testid="payment-patient-header-facts"
                    className="grid h-[8rem] min-w-0 grid-rows-[1fr_auto_1fr] gap-1.5 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/60 px-2.5 py-2 shadow-sm shadow-slate-200/40 lg:col-span-2 lg:row-start-2 xl:col-span-1 xl:col-start-2 xl:row-start-1"
                >
                    <div className="grid min-h-0 min-w-0 items-center gap-1.5 md:grid-cols-3">
                        <PatientFact
                            icon={Phone}
                            label={t('patientDetail.phone')}
                            value={(
                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="truncate tabular-nums">{patient.patient_phone || '-'}</span>
                                    {patient.patient_secondary_phone ? (
                                        <span className="truncate tabular-nums">{patient.patient_secondary_phone}</span>
                                    ) : null}
                                </span>
                            )}
                            title={[patient.patient_phone, patient.patient_secondary_phone].filter(Boolean).join(' / ') || '-'}
                            tone="teal"
                        />
                        <PatientFact
                            icon={CalendarDays}
                            label={t('patientDetail.birthDate')}
                            value={formatLedgerDate(patient.patient_date_of_birth ?? null, locale)}
                            title={formatLedgerDate(patient.patient_date_of_birth ?? null, locale)}
                            tone="sky"
                        />
                        <PatientFact
                            icon={MapPin}
                            label={t('payments.patientLedger.address')}
                            value={patient.patient_address || '-'}
                            title={patient.patient_address || '-'}
                            tone="teal"
                        />
                    </div>
                    <div aria-hidden="true" className="h-px bg-slate-200/70" />
                    <div className="flex h-10 min-w-0 items-center gap-2 overflow-hidden rounded-xl border border-white/80 bg-white/70 px-2.5 py-1.5 text-slate-500 md:col-span-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 ring-1 ring-slate-200/80">
                            <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 truncate text-[12px] font-semibold leading-5">
                            {t('payments.patientLedger.entries')}:{' '}
                            <strong className="font-semibold tabular-nums text-slate-800">
                                {patient.entry_count ?? 0}
                            </strong>
                        </span>
                    </div>
                </div>

                <div
                    data-testid="payment-patient-header-actions"
                    className="flex flex-col items-end gap-2 lg:col-start-2 lg:row-start-1 lg:justify-end xl:col-start-3"
                >
                    {currentUserQuery.data?.subscription?.can_export ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="rounded-full"
                            aria-label={t('common.export')}
                            title={t('common.export')}
                            disabled={isExporting || (patient.entry_count ?? 0) === 0}
                            onClick={handleExport}
                        >
                            {isExporting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Download className="h-4 w-4" />
                            )}
                        </Button>
                    ) : null}
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
                <PaymentSummaryCard
                    icon={CircleDollarSign}
                    label={t('payments.summary.totalDebt')}
                    balances={balances}
                    field="totalDebt"
                    tone="red"
                    hint={t('payments.summary.totalDebtHint')}
                />
                <PaymentSummaryCard
                    icon={BadgeDollarSign}
                    label={t('payments.summary.totalPaid')}
                    balances={balances}
                    field="totalPaid"
                    tone="emerald"
                    hint={t('payments.summary.totalPaidHint')}
                />
                <PaymentSummaryCard
                    icon={Wallet}
                    label={t('payments.summary.netBalance')}
                    balances={balances}
                    field="balance"
                    tone="amber"
                    hint={t('payments.summary.netBalanceHint')}
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
