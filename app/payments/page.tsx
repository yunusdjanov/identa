'use client';

import Link from 'next/link';
import { useDeferredValue, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { DataTableShell, getDataTableClassName } from '@/components/ui/data-table-shell';
import { RecordAuthorBadge } from '@/components/ui/record-author-badge';
import { PaymentsLoadingState } from '@/components/layout/page-loading-skeletons';
import { PageHeader } from '@/components/ui/page-shell';
import { getApiErrorMessage } from '@/lib/api/client';
import { getCurrentUser, listPaymentLedgerHistory, listPaymentLedgerPatients } from '@/lib/api/dentist';
import type { ApiPaymentPatientLedgerRow, ApiRecordActor } from '@/lib/api/types';
import { useI18n } from '@/components/providers/i18n-provider';
import { formatLocalizedDate } from '@/lib/i18n/date';
import { formatToothList, formatToothNumber } from '@/lib/tooth-numbering';
import { extractPrimaryPhone, formatCurrency } from '@/lib/utils';
import { AlertCircle, Download, History, Phone, Search, Users, Wallet, X } from 'lucide-react';
import { buildPdfFilename, exportRowsToPdf } from '@/lib/export/pdf';
import { EmptyState } from '@/components/ui/empty-state';
import { AppErrorState } from '@/components/error/app-error-state';
import { AccessDeniedState } from '@/components/error/access-denied-state';
import { canView } from '@/lib/auth/permissions';
import { toast } from 'sonner';

const PAGE_SIZE = 10;
const OUTSTANDING_FILTER_PARAM = 'outstanding';
const OUTSTANDING_FILTER_VALUE = '1';
const LEDGER_EXPORT_PAGE_SIZE = 100;
const URL_SEARCH_CHANGE_EVENT = 'identa:payments-url-search-change';
const NET_BALANCE_SUMMARY_VARIANTS = {
    advance: {
        statusKey: 'patientHistory.balanceStatus.advance',
        hintKey: 'payments.summary.netBalanceAdvanceHint',
        cardClassName: 'metric-hover-blue border-blue-100 shadow-blue-100/60',
        labelClassName: 'text-blue-600',
        iconClassName: 'text-blue-500',
        valueClassName: 'text-blue-700',
        badgeClassName: 'border-blue-200 bg-blue-50 text-blue-700',
        hintClassName: 'text-blue-500/80',
    },
    settled: {
        statusKey: 'patientHistory.balanceStatus.paid',
        hintKey: 'payments.summary.netBalanceSettledHint',
        cardClassName: 'metric-hover-slate border-slate-200 shadow-slate-200/60',
        labelClassName: 'text-slate-600',
        iconClassName: 'text-slate-500',
        valueClassName: 'text-slate-700',
        badgeClassName: 'border-slate-200 bg-slate-50 text-slate-600',
        hintClassName: 'text-slate-500',
    },
    debt: {
        statusKey: 'patientHistory.balanceStatus.debt',
        hintKey: 'payments.summary.netBalanceHint',
        cardClassName: 'metric-hover-amber border-amber-100 shadow-amber-100/60',
        labelClassName: 'text-amber-600',
        iconClassName: 'text-amber-500',
        valueClassName: 'text-amber-700',
        badgeClassName: 'border-amber-200 bg-amber-50 text-amber-700',
        hintClassName: 'text-amber-500/80',
    },
} as const;

function subscribeToUrlSearch(onStoreChange: () => void) {
    if (typeof window === 'undefined') {
        return () => undefined;
    }

    window.addEventListener('popstate', onStoreChange);
    window.addEventListener(URL_SEARCH_CHANGE_EVENT, onStoreChange);

    return () => {
        window.removeEventListener('popstate', onStoreChange);
        window.removeEventListener(URL_SEARCH_CHANGE_EVENT, onStoreChange);
    };
}

function getUrlSearchSnapshot() {
    return typeof window === 'undefined' ? '' : window.location.search;
}

function getServerUrlSearchSnapshot() {
    return '';
}

function replaceUrl(nextUrl: URL) {
    window.history.replaceState({}, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    window.dispatchEvent(new Event(URL_SEARCH_CHANGE_EVENT));
}

function getNetBalanceSummary(balance: number) {
    if (balance < 0) {
        return { ...NET_BALANCE_SUMMARY_VARIANTS.advance, amount: Math.abs(balance) };
    }

    if (balance === 0) {
        return { ...NET_BALANCE_SUMMARY_VARIANTS.settled, amount: 0 };
    }

    return { ...NET_BALANCE_SUMMARY_VARIANTS.debt, amount: balance };
}

function shouldShowBalanceStatus(debt: number, paid: number, balance: number) {
    return debt !== 0 || paid !== 0 || balance !== 0;
}

function BalanceAmount({ balance, showStatus = true }: { balance: number; showStatus?: boolean }) {
    const { t } = useI18n();
    const summary = getNetBalanceSummary(balance);

    return (
        <div className="flex min-w-[128px] flex-wrap items-center gap-1.5">
            <span className={`font-semibold tabular-nums ${summary.valueClassName}`}>
                {formatCurrency(summary.amount)}
            </span>
            {showStatus ? (
                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${summary.badgeClassName}`}>
                    {t(summary.statusKey)}
                </span>
            ) : null}
        </div>
    );
}

interface PatientBalanceRow {
    patientId: string;
    patientName: string;
    patientPhone: string;
    totalDebt: number;
    totalPaid: number;
    balance: number;
    entryCount: number;
    lastEntryDate: string | null;
}

interface GlobalLedgerRow {
    id: string;
    patientId: string;
    patientName: string;
    patientPhone: string;
    date: string;
    teeth: number[];
    workDone: string;
    comment: string | null;
    debt: number;
    paid: number;
    balanceDelta: number;
    createdBy?: ApiRecordActor | null;
    updatedBy?: ApiRecordActor | null;
}

type PaymentsTab = 'patients' | 'history';

function formatTeeth(teeth: number[]) {
    return formatToothList(teeth);
}

function parsePaymentsTab(value: string | null): PaymentsTab {
    return value === 'history' ? 'history' : 'patients';
}

function toPatientBalanceRow(row: ApiPaymentPatientLedgerRow): PatientBalanceRow {
    return {
        patientId: row.patient_id,
        patientName: row.patient_name,
        patientPhone: extractPrimaryPhone(row.patient_phone ?? '') || '-',
        totalDebt: Number(row.total_debt ?? 0),
        totalPaid: Number(row.total_paid ?? 0),
        balance: Number(row.balance ?? 0),
        entryCount: Number(row.entry_count ?? 0),
        lastEntryDate: row.last_entry_date ?? null,
    };
}

export default function PaymentsPage() {
    const { t, locale } = useI18n();
    const urlSearch = useSyncExternalStore(
        subscribeToUrlSearch,
        getUrlSearchSnapshot,
        getServerUrlSearchSnapshot
    );
    const urlParams = useMemo(() => new URLSearchParams(urlSearch), [urlSearch]);
    const patientIdFromUrl = (urlParams.get('patientId') ?? '').trim();
    const activeTab = parsePaymentsTab(urlParams.get('tab'));
    const showOutstandingOnly = urlParams.get(OUTSTANDING_FILTER_PARAM) === OUTSTANDING_FILTER_VALUE;
    const [patientSearch, setPatientSearch] = useState('');
    const [historySearch, setHistorySearch] = useState('');
    const [patientPage, setPatientPage] = useState(1);
    const [historyPage, setHistoryPage] = useState(1);
    const [isUrlPatientFilterDismissed, setIsUrlPatientFilterDismissed] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const patientFilterId = isUrlPatientFilterDismissed ? '' : patientIdFromUrl;
    const deferredPatientSearch = useDeferredValue(patientSearch.trim());
    const deferredHistorySearch = useDeferredValue(historySearch.trim());
    const currentUserQuery = useQuery({
        queryKey: ['auth', 'me'],
        queryFn: getCurrentUser,
        staleTime: 5 * 60_000,
    });
    const currentUser = currentUserQuery.data;
    const canViewPayments = canView(currentUser, 'payments');
    const canViewPatients = canView(currentUser, 'patients');
    const showRecordAuthors = currentUser?.show_record_authors === true;

    const patientLedgerQuery = useQuery({
        queryKey: [
            'payments',
            'ledger',
            'patients',
            patientFilterId,
            showOutstandingOnly,
            deferredPatientSearch,
            patientPage,
        ],
        enabled: canViewPayments,
        queryFn: () =>
            listPaymentLedgerPatients({
                page: patientPage,
                perPage: PAGE_SIZE,
                filter: {
                    patient_id: patientFilterId || undefined,
                    outstanding: showOutstandingOnly ? OUTSTANDING_FILTER_VALUE : undefined,
                    search: deferredPatientSearch || undefined,
                },
            }),
        placeholderData: (previousData) => previousData,
        staleTime: 300000,
        gcTime: 900000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });
    const historyLedgerQuery = useQuery({
        queryKey: [
            'payments',
            'ledger',
            'history',
            patientFilterId,
            showOutstandingOnly,
            deferredHistorySearch,
            historyPage,
        ],
        enabled: canViewPayments && activeTab === 'history',
        queryFn: () =>
            listPaymentLedgerHistory({
                page: historyPage,
                perPage: PAGE_SIZE,
                filter: {
                    patient_id: patientFilterId || undefined,
                    outstanding: showOutstandingOnly ? OUTSTANDING_FILTER_VALUE : undefined,
                    search: deferredHistorySearch || undefined,
                },
            }),
        placeholderData: (previousData) => previousData,
        staleTime: 300000,
        gcTime: 900000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
    });

    const formatDate = (value: string | null) => {
        if (!value) {
            return '-';
        }

        return formatLocalizedDate(value, locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const patientRows = useMemo(
        () => (patientLedgerQuery.data?.data ?? []).map(toPatientBalanceRow),
        [patientLedgerQuery.data]
    );

    const globalHistoryRows = useMemo(() => {
        return (historyLedgerQuery.data?.data ?? []).map((row): GlobalLedgerRow => ({
            id: row.id,
            patientId: row.patient_id,
            patientName: row.patient_name ?? 'Unknown patient',
            patientPhone: extractPrimaryPhone(row.patient_phone ?? '') || '-',
            date: row.date ?? '',
            teeth: row.teeth ?? [],
            workDone: row.work_done,
            comment: row.comment,
            debt: Number(row.debt ?? 0),
            paid: Number(row.paid ?? 0),
            balanceDelta: Number(row.balance_delta ?? 0),
            createdBy: row.created_by ?? null,
            updatedBy: row.updated_by ?? null,
        }));
    }, [historyLedgerQuery.data]);

    const overallSummary = useMemo(() => {
        const summary = patientLedgerQuery.data?.meta?.summary;
        return {
            totalDebt: Number(summary?.total_debt ?? 0),
            totalPaid: Number(summary?.total_paid ?? 0),
            totalBalance: Number(summary?.total_balance ?? 0),
            totalEntries: Number(summary?.total_entries ?? 0),
            totalPatients: Number(summary?.total_patients ?? 0),
        };
    }, [patientLedgerQuery.data]);

    const patientPagination = patientLedgerQuery.data?.meta?.pagination;
    const historyPagination = historyLedgerQuery.data?.meta?.pagination;
    const patientTotalCount = patientPagination?.total ?? 0;
    const historyTotalCount = historyPagination?.total ?? 0;
    const patientTotalPages = Math.max(1, patientPagination?.total_pages ?? 1);
    const historyTotalPages = Math.max(1, historyPagination?.total_pages ?? 1);
    const effectivePatientPage = Math.min(patientPage, patientTotalPages);
    const effectiveHistoryPage = Math.min(historyPage, historyTotalPages);
    const paginatedPatientRows = patientRows;
    const paginatedHistoryRows = globalHistoryRows;

    const updateUrlSearch = (update: (params: URLSearchParams) => void) => {
        if (typeof window === 'undefined') {
            return;
        }

        const nextUrl = new URL(window.location.href);
        update(nextUrl.searchParams);
        replaceUrl(nextUrl);
    };

    const clearPatientFilter = () => {
        setIsUrlPatientFilterDismissed(true);
        setPatientPage(1);
        setHistoryPage(1);
        updateUrlSearch((params) => params.delete('patientId'));
    };

    const handleOutstandingFilterChange = () => {
        const nextShowOutstandingOnly = !showOutstandingOnly;
        setPatientPage(1);
        setHistoryPage(1);
        updateUrlSearch((params) => {
            if (nextShowOutstandingOnly) {
                params.set(OUTSTANDING_FILTER_PARAM, OUTSTANDING_FILTER_VALUE);
                return;
            }

            params.delete(OUTSTANDING_FILTER_PARAM);
        });
    };

    const handleTabChange = (tab: PaymentsTab) => {
        setPatientPage(1);
        setHistoryPage(1);
        updateUrlSearch((params) => {
            if (tab === 'history') {
                params.set('tab', 'history');
            } else {
                params.delete('tab');
            }
        });
    };

    const handleExportPayments = async () => {
        if (overallSummary.totalPatients === 0) {
            toast.error(t('export.empty'));
            return;
        }

        setIsExporting(true);
        try {
            const rows: PatientBalanceRow[] = [];
            let page = 1;
            let totalPages = 1;

            do {
                const response = await listPaymentLedgerPatients({
                    page,
                    perPage: LEDGER_EXPORT_PAGE_SIZE,
                    filter: {
                        patient_id: patientFilterId || undefined,
                        outstanding: showOutstandingOnly ? OUTSTANDING_FILTER_VALUE : undefined,
                        search: patientSearch.trim() || undefined,
                    },
                });
                rows.push(...response.data.map(toPatientBalanceRow));
                totalPages = response.meta?.pagination?.total_pages ?? 1;
                page += 1;
            } while (page <= totalPages);

            if (rows.length === 0) {
                toast.error(t('export.empty'));
                return;
            }

            exportRowsToPdf({
                filename: buildPdfFilename('payments'),
                title: t('payments.title'),
                subtitle: t('payments.subtitle'),
                locale,
                columns: [
                    t('payments.table.patient'),
                    t('patients.table.phone'),
                    t('payments.table.entries'),
                    t('payments.table.debt'),
                    t('payments.table.paid'),
                    t('payments.table.balance'),
                    t('payments.table.lastEntry'),
                ],
                rows: rows.map((row) => [
                    row.patientName,
                    row.patientPhone,
                    String(row.entryCount),
                    formatCurrency(row.totalDebt),
                    formatCurrency(row.totalPaid),
                    shouldShowBalanceStatus(row.totalDebt, row.totalPaid, row.balance)
                        ? `${formatCurrency(Math.abs(row.balance))} (${t(getNetBalanceSummary(row.balance).statusKey)})`
                        : formatCurrency(Math.abs(row.balance)),
                    row.lastEntryDate ? formatLocalizedDate(row.lastEntryDate, locale, { year: 'numeric', month: 'short', day: 'numeric' }) : '-',
                ]),
                summary: [
                    { label: t('payments.summary.totalDebt'), value: formatCurrency(overallSummary.totalDebt) },
                    { label: t('payments.summary.totalPaid'), value: formatCurrency(overallSummary.totalPaid) },
                    {
                        label: t('payments.summary.totalBalance'),
                        value: shouldShowNetBalanceStatus
                            ? `${formatCurrency(Math.abs(overallSummary.totalBalance))} (${t(getNetBalanceSummary(overallSummary.totalBalance).statusKey)})`
                            : formatCurrency(Math.abs(overallSummary.totalBalance)),
                    },
                ],
                orientation: 'landscape',
            });
            toast.success(t('export.downloaded'));
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('payments.error.loadFailed')));
        } finally {
            setIsExporting(false);
        }
    };

    if (
        currentUserQuery.isLoading
        || (patientLedgerQuery.isLoading && !patientLedgerQuery.data)
        || (activeTab === 'history' && historyLedgerQuery.isLoading && !historyLedgerQuery.data)
    ) {
        return <PaymentsLoadingState />;
    }

    if (!canViewPayments) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('payments.title')} description={t('payments.subtitle')} />
                <AccessDeniedState
                    title={t('common.forbiddenTitle')}
                    description={t('permissions.deniedDescription')}
                    actionLabel={t('dashboard.title')}
                    className="min-h-[20rem] px-0 py-0"
                />
            </div>
        );
    }

    if (
        (
            currentUserQuery.isError
            || (patientLedgerQuery.isError && !patientLedgerQuery.data)
            || (activeTab === 'history' && historyLedgerQuery.isError && !historyLedgerQuery.data)
        )
    ) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('payments.title')} description={t('payments.subtitle')} />
                <AppErrorState
                    title={t('common.loadErrorTitle')}
                    description={getApiErrorMessage(
                        currentUserQuery.error || patientLedgerQuery.error || historyLedgerQuery.error,
                        t('payments.error.loadFailed')
                    )}
                    retryLabel={t('common.retry')}
                    onRetry={() => {
                        currentUserQuery.refetch();
                        patientLedgerQuery.refetch();
                        historyLedgerQuery.refetch();
                    }}
                    className="min-h-[20rem] px-0 py-0"
                />
            </div>
        );
    }

    const isAccountingLoading = patientLedgerQuery.isLoading && !patientLedgerQuery.data;
    const netBalanceSummary = getNetBalanceSummary(overallSummary.totalBalance);
    const shouldShowNetBalanceStatus = shouldShowBalanceStatus(
        overallSummary.totalDebt,
        overallSummary.totalPaid,
        overallSummary.totalBalance
    );

    return (
        <div className="space-y-5 lg:space-y-6">
            <PageHeader
                title={t('payments.title')}
                description={t('payments.subtitle')}
                actions={currentUser?.subscription?.can_export ? (
                    <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={overallSummary.totalPatients === 0 || isExporting}
                        onClick={handleExportPayments}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        {t('common.export')}
                    </Button>
                ) : undefined}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="interactive-card metric-hover-card metric-hover-red rounded-2xl border border-red-100 bg-white p-4 shadow-sm shadow-red-100/60 md:p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        {t('payments.summary.totalDebt')}
                    </div>
                    <p className="mt-2 text-lg font-semibold leading-none tabular-nums text-red-700">
                        {isAccountingLoading ? '...' : formatCurrency(overallSummary.totalDebt)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{t('payments.summary.totalDebtHint')}</p>
                </div>

                <div className="interactive-card metric-hover-card metric-hover-emerald rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm shadow-emerald-100/60 md:p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                        <Wallet className="h-4 w-4 text-green-600" />
                        {t('payments.summary.totalPaid')}
                    </div>
                    <p className="mt-2 text-lg font-semibold leading-none tabular-nums text-green-700">
                        {isAccountingLoading ? '...' : formatCurrency(overallSummary.totalPaid)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{t('payments.summary.totalPaidHint')}</p>
                </div>

                <div className={`interactive-card metric-hover-card rounded-2xl border bg-white p-4 shadow-sm md:p-5 ${netBalanceSummary.cardClassName}`}>
                    <div className={`flex flex-wrap items-center gap-2 text-sm font-medium ${netBalanceSummary.labelClassName}`}>
                        <History className={`h-4 w-4 ${netBalanceSummary.iconClassName}`} />
                        <span>{t('payments.summary.netBalance')}</span>
                        {!isAccountingLoading && shouldShowNetBalanceStatus ? (
                            <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${netBalanceSummary.badgeClassName}`}>
                                {t(netBalanceSummary.statusKey)}
                            </span>
                        ) : null}
                    </div>
                    <p className={`mt-2 text-lg font-semibold leading-none tabular-nums ${netBalanceSummary.valueClassName}`}>
                        {isAccountingLoading ? '...' : formatCurrency(netBalanceSummary.amount)}
                    </p>
                    <p className={`mt-1 text-xs ${netBalanceSummary.hintClassName}`}>{t(netBalanceSummary.hintKey)}</p>
                </div>

                <div className="interactive-card metric-hover-card metric-hover-teal rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 via-teal-50/80 to-white p-4 shadow-sm shadow-cyan-100/70 md:p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-cyan-700">
                        <Users className="h-4 w-4 text-teal-600" />
                        {t('payments.summary.totalPatients')}
                    </div>
                    <p className="mt-2 text-lg font-semibold leading-none tabular-nums text-cyan-950">
                        {isAccountingLoading ? '...' : overallSummary.totalPatients}
                    </p>
                    <p className="mt-1 text-xs text-cyan-600/80">
                        {t('payments.summary.entryCount', { count: overallSummary.totalEntries })}
                    </p>
                </div>
            </div>

            <Card className="overflow-hidden rounded-2xl bg-white">
                <CardContent className="space-y-5 p-4 sm:p-5">
                    <div className="flex flex-col gap-4 rounded-2xl border border-teal-100/80 bg-white p-3 shadow-xs lg:flex-row lg:items-center lg:justify-between">
                        <div className="inline-flex w-full items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 shadow-xs sm:w-auto">
                            <Button
                                type="button"
                                variant="ghost"
                                className={`flex-1 gap-2 rounded-lg sm:flex-none ${
                                    activeTab === 'patients'
                                        ? 'bg-teal-50 text-teal-700 shadow-sm ring-1! ring-teal-300! focus-visible:border-transparent! hover:bg-teal-50 hover:text-teal-700'
                                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                }`}
                                onClick={() => handleTabChange('patients')}
                            >
                                <Users className="h-4 w-4" />
                                {t('payments.tabs.patients')}
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                className={`flex-1 gap-2 rounded-lg sm:flex-none ${
                                    activeTab === 'history'
                                        ? 'bg-teal-50 text-teal-700 shadow-sm ring-1! ring-teal-300! focus-visible:border-transparent! hover:bg-teal-50 hover:text-teal-700'
                                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                                }`}
                                onClick={() => handleTabChange('history')}
                            >
                                <History className="h-4 w-4" />
                                {t('payments.tabs.history')}
                            </Button>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                            <div className="relative min-w-0 sm:w-[22rem]">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={activeTab === 'patients' ? patientSearch : historySearch}
                                    onChange={(event) => {
                                        if (activeTab === 'patients') {
                                            setPatientSearch(event.target.value);
                                            setPatientPage(1);
                                            return;
                                        }

                                        setHistorySearch(event.target.value);
                                        setHistoryPage(1);
                                    }}
                                    placeholder={activeTab === 'patients' ? t('payments.search.patientPlaceholder') : t('payments.search.historyPlaceholder')}
                                    className="h-9 rounded-xl border-slate-200 bg-white pl-9 shadow-xs"
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                aria-pressed={showOutstandingOnly}
                                aria-label={t('payments.filters.outstandingOnly')}
                                title={showOutstandingOnly ? t('payments.filters.clearOutstanding') : t('payments.filters.outstandingHint')}
                                className={`h-9 w-full justify-center rounded-xl px-3 sm:w-auto ${
                                    showOutstandingOnly
                                        ? 'border-red-200 bg-red-50 text-red-700 shadow-xs ring-1 ring-red-100 hover:bg-red-50 hover:text-red-700'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                }`}
                                onClick={handleOutstandingFilterChange}
                            >
                                <AlertCircle className={`h-4 w-4 ${showOutstandingOnly ? 'text-red-600' : 'text-slate-400'}`} />
                                <span>{t('payments.filters.outstandingOnly')}</span>
                                {showOutstandingOnly ? <X className="h-3.5 w-3.5 text-red-600" aria-hidden="true" /> : null}
                            </Button>
                            {patientFilterId ? (
                                <Button variant="outline" className="rounded-xl bg-white" onClick={clearPatientFilter}>{t('payments.clearFilter')}</Button>
                            ) : null}
                        </div>
                    </div>

                    {patientFilterId ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-100 bg-teal-50/80 px-4 py-3">
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-teal-900">{t('payments.patientFilterActive')}</p>
                                <p className="text-xs text-teal-700">{t('payments.patientFilterDescription')}</p>
                            </div>
                            <Button variant="outline" size="sm" onClick={clearPatientFilter}>{t('payments.clearFilter')}</Button>
                        </div>
                    ) : null}

                    {activeTab === 'patients' ? (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/70 p-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900">{t('payments.patientsTitle')}</h2>
                                    <p className="text-sm text-slate-500">{t('payments.patientsSubtitle')}</p>
                                </div>
                                <p className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-500 shadow-xs">{t('payments.summary.filteredPatients', { count: patientTotalCount })}</p>
                            </div>

                            {patientTotalCount === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200">
                                    <EmptyState
                                        icon={Wallet}
                                        title={showOutstandingOnly ? t('payments.empty.outstandingPatients') : t('payments.empty.patients')}
                                    />
                                </div>
                            ) : (
                                <>
                                    <DataTableShell>
                                        <Table className={getDataTableClassName('standard')}>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>{t('payments.table.number')}</TableHead>
                                                    <TableHead>{t('payments.table.patient')}</TableHead>
                                                    <TableHead>{t('payments.table.lastEntry')}</TableHead>
                                                    <TableHead>{t('payments.table.entries')}</TableHead>
                                                    <TableHead>{t('payments.table.debt')}</TableHead>
                                                    <TableHead>{t('payments.table.paid')}</TableHead>
                                                    <TableHead>{t('payments.table.balance')}</TableHead>
                                                    <TableHead className="text-right">{t('payments.table.actions')}</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {paginatedPatientRows.map((row, index) => (
                                                    <TableRow key={row.patientId}>
                                                        <TableCell>{(effectivePatientPage - 1) * PAGE_SIZE + index + 1}</TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1">
                                                                <p className="font-medium text-slate-900">{row.patientName}</p>
                                                                <p className="text-xs text-slate-500">
                                                                    <Phone aria-hidden="true" className="mr-1 inline-block h-3 w-3 text-slate-400" />
                                                                    {row.patientPhone}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{formatDate(row.lastEntryDate)}</TableCell>
                                                        <TableCell>{row.entryCount}</TableCell>
                                                        <TableCell className="text-red-700">{formatCurrency(row.totalDebt)}</TableCell>
                                                        <TableCell className="text-green-700">{formatCurrency(row.totalPaid)}</TableCell>
                                                        <TableCell>
                                                            <BalanceAmount
                                                                balance={row.balance}
                                                                showStatus={shouldShowBalanceStatus(row.totalDebt, row.totalPaid, row.balance)}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {canViewPatients ? (
                                                                <Button asChild variant="outline" size="sm">
                                                                    <Link href={`/patients/${row.patientId}/history?from=payments`}>
                                                                        {t('payments.openHistory')}
                                                                    </Link>
                                                                </Button>
                                                            ) : (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => toast.error(t('permissions.deniedDescription'))}
                                                                >
                                                                    {t('payments.openHistory')}
                                                                </Button>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </DataTableShell>

                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <p className="text-sm text-slate-500">{t('payments.pagination.pageOf', { page: effectivePatientPage, total: patientTotalPages })}</p>
                                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="min-w-[96px]"
                                                disabled={effectivePatientPage === 1}
                                                onClick={() => setPatientPage((current) => Math.max(1, current - 1))}
                                            >
                                                {t('payments.pagination.previous')}
                                            </Button>
                                            <span className="inline-flex min-w-[132px] justify-center rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 shadow-xs">
                                                {t('payments.pagination.pageOf', { page: effectivePatientPage, total: patientTotalPages })}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="min-w-[80px]"
                                                disabled={effectivePatientPage >= patientTotalPages}
                                                onClick={() => setPatientPage((current) => Math.min(patientTotalPages, current + 1))}
                                            >
                                                {t('payments.pagination.next')}
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/70 p-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900">{t('payments.historyTitle')}</h2>
                                    <p className="text-sm text-slate-500">{t('payments.historySubtitle')}</p>
                                </div>
                                <p className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-500 shadow-xs">{t('payments.summary.filteredEntries', { count: historyTotalCount })}</p>
                            </div>

                            {historyTotalCount === 0 ? (
                                <div className="rounded-xl border border-dashed border-slate-200 px-6 py-10 text-center">
                                    <History className="mx-auto h-10 w-10 text-slate-300" />
                                    <p className="mt-4 text-sm text-slate-500">{showOutstandingOnly ? t('payments.empty.outstandingHistory') : t('payments.empty.history')}</p>
                                </div>
                            ) : (
                                <>
                                    <DataTableShell>
                                        <Table className={getDataTableClassName('standard')}>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>{t('payments.table.date')}</TableHead>
                                                    <TableHead>{t('payments.table.patient')}</TableHead>
                                                    <TableHead>{t('payments.table.teeth')}</TableHead>
                                                    <TableHead>{t('payments.table.workDone')}</TableHead>
                                                    <TableHead>{t('payments.table.debt')}</TableHead>
                                                    <TableHead>{t('payments.table.paid')}</TableHead>
                                                    <TableHead>{t('payments.table.balance')}</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {paginatedHistoryRows.map((row) => (
                                                    <TableRow key={row.id}>
                                                        <TableCell>{formatDate(row.date)}</TableCell>
                                                        <TableCell>
                                                            <div className="space-y-1">
                                                                <p className="font-medium text-slate-900">{row.patientName}</p>
                                                                <p className="text-xs text-slate-500">{row.patientPhone}</p>
                                                                {showRecordAuthors ? (
                                                                    <RecordAuthorBadge
                                                                        className="mt-1"
                                                                        createdBy={row.createdBy}
                                                                        updatedBy={row.updatedBy}
                                                                    />
                                                                ) : null}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            {row.teeth.length === 0 ? (
                                                                <span className="inline-flex h-7 items-center rounded-full border border-dashed border-slate-200 px-3 text-xs font-medium text-slate-400">
                                                                    -
                                                                </span>
                                                            ) : (
                                                                <div className="flex flex-wrap items-center gap-1.5" title={formatTeeth(row.teeth)}>
                                                                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
                                                                        {formatToothNumber(row.teeth[0])}
                                                                    </span>
                                                                    {row.teeth.length > 1 ? (
                                                                        <span className="inline-flex h-7 items-center justify-center rounded-full border border-teal-200 bg-teal-50 px-2.5 text-xs font-semibold text-teal-700">
                                                                            +{row.teeth.length - 1}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="max-w-[360px]">
                                                            <div className="min-w-0 space-y-1">
                                                                <p
                                                                    className="max-w-[220px] truncate font-medium text-slate-900 sm:max-w-[250px] lg:max-w-[280px]"
                                                                    title={row.workDone}
                                                                >
                                                                    {row.workDone}
                                                                </p>
                                                                {row.comment ? (
                                                                    <p
                                                                        className="max-w-[220px] truncate text-xs text-slate-500 sm:max-w-[250px] lg:max-w-[280px]"
                                                                        title={row.comment}
                                                                    >
                                                                        {row.comment}
                                                                    </p>
                                                                ) : null}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-red-700">{formatCurrency(row.debt)}</TableCell>
                                                        <TableCell className="text-green-700">{formatCurrency(row.paid)}</TableCell>
                                                        <TableCell>
                                                            <BalanceAmount
                                                                balance={row.balanceDelta}
                                                                showStatus={shouldShowBalanceStatus(row.debt, row.paid, row.balanceDelta)}
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </DataTableShell>

                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <p className="text-sm text-slate-500">{t('payments.pagination.pageOf', { page: effectiveHistoryPage, total: historyTotalPages })}</p>
                                        <div className="flex flex-wrap items-center gap-2 md:justify-end">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="min-w-[96px]"
                                                disabled={effectiveHistoryPage === 1}
                                                onClick={() => setHistoryPage((current) => Math.max(1, current - 1))}
                                            >
                                                {t('payments.pagination.previous')}
                                            </Button>
                                            <span className="inline-flex min-w-[132px] justify-center rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 shadow-xs">
                                                {t('payments.pagination.pageOf', { page: effectiveHistoryPage, total: historyTotalPages })}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="min-w-[80px]"
                                                disabled={effectiveHistoryPage >= historyTotalPages}
                                                onClick={() => setHistoryPage((current) => Math.min(historyTotalPages, current + 1))}
                                            >
                                                {t('payments.pagination.next')}
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
