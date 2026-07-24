'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
    Download,
    Loader2,
    ReceiptText,
    UserRound,
} from 'lucide-react';
import { toast } from 'sonner';

import { AccessDeniedState } from '@/components/error/access-denied-state';
import { AppErrorState } from '@/components/error/app-error-state';
import { PaymentPatientLoadingState } from '@/components/layout/page-loading-skeletons';
import { PatientDetailHeader } from '@/components/patients/patient-detail-header';
import { useI18n } from '@/components/providers/i18n-provider';
import { Button } from '@/components/ui/button';
import { DataTableShell, getDataTableClassName } from '@/components/ui/data-table-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionPanel } from '@/components/ui/page-shell';
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
    getPatient,
    listPaymentLedgerHistory,
    listPaymentLedgerPatients,
} from '@/lib/api/dentist';
import type {
    ApiMoneyCurrency,
    ApiPatient,
    ApiPaymentHistoryLedgerRow,
    ApiPaymentPatientLedgerRow,
} from '@/lib/api/types';
import { canView } from '@/lib/auth/permissions';
import { buildPdfFilename, exportPatientReportToPdf } from '@/lib/export/pdf';
import { formatLocalizedDate } from '@/lib/i18n/date';
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

type PaymentSummaryTone = 'red' | 'emerald' | 'blue' | 'yellow' | 'slate';

function getPaymentSummaryToneClasses(tone: PaymentSummaryTone) {
    switch (tone) {
        case 'red':
            return 'border-red-100 bg-red-50/45 text-red-700';
        case 'emerald':
            return 'border-emerald-100 bg-emerald-50/45 text-emerald-700';
        case 'blue':
            return 'border-blue-100 bg-blue-50/45 text-blue-700';
        case 'yellow':
            return 'border-yellow-100 bg-yellow-50/45 text-amber-700';
        case 'slate':
        default:
            return 'border-slate-200 bg-slate-50/70 text-slate-700';
    }
}

function getPaymentBalanceTone(balances: PatientBalances): PaymentSummaryTone {
    const activeBalances = MONEY_CURRENCIES
        .map((currency) => balances[currency].balance)
        .filter((balance) => balance !== 0);

    if (activeBalances.length === 0) {
        return 'slate';
    }

    if (activeBalances.every((balance) => balance < 0)) {
        return 'blue';
    }

    if (activeBalances.every((balance) => balance > 0)) {
        return 'yellow';
    }

    return 'slate';
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

function PaymentSummaryCard({
    label,
    balances,
    field,
    hint,
}: {
    label: string;
    balances: PatientBalances;
    field: 'totalDebt' | 'totalPaid' | 'balance';
    hint: string;
}) {
    const { t } = useI18n();
    const currencies = getVisibleCurrencies(balances);
    const tone: PaymentSummaryTone = field === 'totalDebt'
        ? 'red'
        : field === 'totalPaid'
            ? 'emerald'
            : getPaymentBalanceTone(balances);
    const activeBalances = currencies
        .map((currency) => balances[currency].balance)
        .filter((balance) => balance !== 0);
    const hasMixedBalanceStatus = field === 'balance'
        && activeBalances.some((balance) => balance > 0)
        && activeBalances.some((balance) => balance < 0);
    const sharedBalanceStatus = field === 'balance' && activeBalances.length > 0
        ? activeBalances.every((balance) => balance < 0)
            ? t('patientHistory.balanceStatus.advance')
            : activeBalances.every((balance) => balance > 0)
                ? t('patientHistory.balanceStatus.debt')
                : null
        : null;
    const formattedValue = currencies
        .map((currency) => {
            const rawAmount = balances[currency][field];
            const amount = field === 'balance' ? Math.abs(rawAmount) : rawAmount;
            return formatCurrency(amount, currency);
        })
        .join(' / ');

    return (
        <article
            data-testid={`payment-summary-${field}`}
            title={hint}
            className={cn(
                'flex min-h-10 min-w-0 flex-col justify-center rounded-xl border px-3 py-1.5 shadow-sm shadow-slate-100/50',
                getPaymentSummaryToneClasses(tone)
            )}
        >
            <div className="truncate text-[9px] font-bold uppercase leading-[0.7rem] tracking-[0.1em] text-slate-400">
                {label}
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
                <div className="min-w-0 whitespace-normal break-words text-sm font-bold leading-4 tabular-nums">
                    {hasMixedBalanceStatus ? (
                        <div className="flex flex-col gap-0.5 whitespace-normal leading-tight">
                            {currencies.map((currency) => {
                                const rawAmount = balances[currency].balance;
                                return (
                                    <span key={currency} className="flex flex-wrap items-center gap-1.5">
                                        <span className="whitespace-nowrap tabular-nums">
                                            {formatCurrency(Math.abs(rawAmount), currency)}
                                        </span>
                                        {rawAmount !== 0 ? (
                                            <span className={cn(
                                                'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                                                rawAmount < 0
                                                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                                                    : 'border-yellow-200 bg-yellow-50 text-yellow-700'
                                            )}>
                                                {t(rawAmount < 0
                                                    ? 'patientHistory.balanceStatus.advance'
                                                    : 'patientHistory.balanceStatus.debt')}
                                            </span>
                                        ) : null}
                                    </span>
                                );
                            })}
                        </div>
                    ) : (
                        formattedValue
                    )}
                </div>
                {sharedBalanceStatus ? (
                    <span className="shrink-0 rounded-full border border-current/20 bg-white/55 px-1.5 py-0.5 text-[9px] font-bold leading-none">
                        {sharedBalanceStatus}
                    </span>
                ) : null}
            </div>
            <span className="sr-only">{hint}</span>
        </article>
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
    const canViewPatients = canView(currentUserQuery.data, 'patients');

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

    const profilePatientQuery = useQuery({
        queryKey: ['patients', 'detail', id, { rememberRecent: false }],
        enabled: canViewPayments && canViewPatients,
        retry: false,
        queryFn: () => getPatient(id),
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

    if (
        patientQuery.isLoading
        || ledgerQuery.isLoading
        || (canViewPatients && profilePatientQuery.isLoading)
    ) {
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
                    if (canViewPatients) {
                        profilePatientQuery.refetch();
                    }
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
    const headerPatient: ApiPatient = profilePatientQuery.data ?? {
        id: patient.patient_id,
        patient_id: patient.patient_code ?? '',
        full_name: patient.patient_name,
        phone: patient.patient_phone ?? '',
        secondary_phone: patient.patient_secondary_phone,
        address: patient.patient_address,
        date_of_birth: patient.patient_date_of_birth,
        medical_history: null,
        allergies: null,
        current_medications: null,
        photo_scan_status: patient.patient_photo_scan_status,
        photo_url: patient.patient_photo_url,
        photo_thumbnail_url: patient.patient_photo_thumbnail_url,
        photo_preview_url: patient.patient_photo_preview_url,
        photo_thumbnail_ready: patient.patient_photo_thumbnail_ready,
        photo_preview_ready: patient.patient_photo_preview_ready,
        last_visit_at: patient.last_entry_date,
        categories: [],
    };

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
        <div className="space-y-2">
            <PatientDetailHeader
                patient={headerPatient}
                currentUser={currentUserQuery.data}
            />

            <SectionPanel className="space-y-4">
                <div
                    data-testid="payment-ledger-header"
                    className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center"
                >
                    <div className="shrink-0 xl:w-52">
                        <h2 className="text-base font-bold text-slate-950 sm:text-lg">
                            {t('payments.patientLedger.tableTitle')}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            {t('payments.patientLedger.tableDescription')}
                        </p>
                    </div>

                    <section
                        data-testid="payment-summary-grid"
                        className="grid min-w-0 flex-1 gap-2 md:grid-cols-3"
                    >
                        <PaymentSummaryCard
                            label={t('payments.summary.totalDebt')}
                            balances={balances}
                            field="totalDebt"
                            hint={t('payments.summary.totalDebtHint')}
                        />
                        <PaymentSummaryCard
                            label={t('payments.summary.totalPaid')}
                            balances={balances}
                            field="totalPaid"
                            hint={t('payments.summary.totalPaidHint')}
                        />
                        <PaymentSummaryCard
                            label={t('payments.summary.netBalance')}
                            balances={balances}
                            field="balance"
                            hint={t('payments.summary.netBalanceHint')}
                        />
                    </section>

                    {currentUserQuery.data?.subscription?.can_export ? (
                        <Button
                            variant="outline"
                            size="icon-lg"
                            className="shrink-0 self-end rounded-full xl:self-auto"
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
